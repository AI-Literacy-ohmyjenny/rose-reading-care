/**
 * Rose Reading Care - 초등 독서상담 웹앱
 * GitHub Pages 배포용 - 로컬 CSV + 상대경로 이미지
 */

// ========== Gemini API 설정 ==========
const GEMINI_API_KEY = "AIzaSyBkE4vKP4jkG7ZOaGSHxTxdgfAeww0GM3U";
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ========== 설정 ==========
const CSV_PATH = "./AI_독서상담_DB/시나리오.csv";
const IMAGE_BASE_PATH = "./AI_독서상담_DB/Ai_Book1_001_images/";

// ========== 상태 ==========
let scenarioData = [];
let currentIndex = 0;
let isAdvancing = false; // 선생님 발화 순차 출력 중 여부
let usedSTT = false;    // 현재 입력이 마이크(STT)로 들어왔는지 여부
let voicePraiseCount = 0;       // 목소리 칭찬 사용 횟수
const VOICE_PRAISE_LIMIT = 2;   // 상담 전체에서 목소리 칭찬 최대 횟수
const TEACHER_DELAY_MS = 2000;
const TEACHER_DELAY_SHORT_MS = 800; // 짧은 답변(네/아니오) 후 빠른 반응
const READING_DELAY_MS = 10000;
const READING_TRIGGER = "선생님이 다음 내용을 읽어줄게요";
const PLACEHOLDER_DEFAULT = "선생님께 할 말을 적거나 마이크를 눌러보세요...";
const PLACEHOLDER_LOADING = "잠시만 기다려 주세요...";
const PLACEHOLDER_END = "오늘 상담이 끝났어요!";
const PLACEHOLDER_LISTENING = "듣고 있어요... 말해 보세요!";
// ========== 맥락 기반 낭독/생각 판별 ==========

// 선생님의 직전 대사에 포함된 '읽기 요청' 키워드
const READING_REQUEST_KEYWORDS = [
  "읽어보세요", "읽어볼까요", "읽어주세요", "읽어줄래",
  "읽어볼까", "읽어줘", "읽어 볼까", "읽어 볼게",
  "읽어 보세요", "읽어 주세요", "읽어 줄래",
  "소리 내어 읽", "먼저 읽",
];

/**
 * 선생님의 직전 대사가 읽기 요청인지 판별
 */
function isReadingRequest(teacherText) {
  if (!teacherText) return false;
  return READING_REQUEST_KEYWORDS.some((kw) => teacherText.includes(kw));
}

/**
 * 텍스트 정규화 (비교용: 공백·구두점·태그 제거)
 */
function normalize(text) {
  return String(text || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/[.,!?~…·'""''「」\s]/g, "")
    .toLowerCase();
}

/**
 * 두 텍스트의 유사도 (0~1)
 */
function similarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  let match = 0;
  for (const ch of shorter) {
    if (longer.includes(ch)) match++;
  }
  return match / shorter.length;
}

// 낭독 칭찬 (마이크/키보드 공통 — 목소리 언급 없음)
const READING_PRAISE = [
  "정말 잘 읽었어요! 또박또박 읽는 모습이 너무 멋져요.",
  "우와, 선생님이 깜짝 놀랐어요! 이렇게 잘 읽다니 정말 대단해요.",
  "아주 잘 읽었어요! 홈런이는 읽기 천재인 것 같아요.",
  "잘 읽었어요! 읽으니까 이야기가 더 재미있어지는 것 같아요.",
];

// 마이크 낭독 전용 칭찬 (목소리 언급 포함)
const READING_PRAISE_MIC = [
  "우리 홈런이가 정말 또박또박 잘 읽어주었네! 목소리가 여기까지 들리는 것 같아요.",
  "목소리가 정말 예쁘게 들리는 것 같아요! 잘 읽었어요.",
  "와~ 예쁜 목소리로 정말 잘 읽었어요!",
];

// 읽기 요청인데 짧은 답변(5자 미만) → 다정한 격려
const READING_SHORT_FALLBACK = [
  "괜찮아요~ 어려우면 선생님이 먼저 읽어줄게요! 천천히 따라해 봐요.",
  "힘들었구나. 괜찮아요, 선생님이랑 같이 읽어볼까요?",
  "그래도 대답해줘서 고마워요! 선생님이 도와줄게요.",
];

// ========== 공감 응대 시스템 ==========

/**
 * 공감 원칙
 * 1. 아이의 말을 따옴표로 반복(Echoing)하지 않는다.
 * 2. 공감은 짧게 한 문장(감정 리액션)으로 끝낸다.
 * 3. 시나리오 대사와 병합할 때 전환어로 자연스럽게 연결한다.
 */

// ── 공감 멘트 (짧고 따뜻한 한 문장) ──
const EMPATHY = {
  keyword: [
    { words: ["좋아"], responses: [
      "우리 홈런이랑 마음이 딱 통했네!",
      "선생님도 그 말 듣고 기분이 좋아졌어요!",
    ]},
    { words: ["싫어", "싫은"], responses: [
      "솔직하게 말해줘서 고마워요.",
      "그렇게 느낄 수 있어요, 괜찮아요.",
    ]},
    { words: ["슬퍼", "슬프"], responses: [
      "마음이 좀 속상했구나...",
      "선생님이 옆에서 같이 있어줄게요.",
    ]},
    { words: ["무서"], responses: [
      "괜찮아요, 선생님이 옆에 있잖아요!",
      "용기 내서 말해줬구나!",
    ]},
    { words: ["재미", "재밌"], responses: [
      "선생님도 이 부분 정말 재미있어요!",
      "같이 읽으니까 더 즐겁죠?",
    ]},
    { words: ["신기"], responses: [
      "홈런이 눈이 반짝반짝하는 게 보여요!",
      "멋진 호기심이에요!",
    ]},
    { words: ["모르", "모를"], responses: [
      "괜찮아요, 같이 알아봐요!",
      "천천히 생각해 보면 분명 알 수 있어요.",
    ]},
    { words: ["어려", "어렵"], responses: [
      "도전하는 모습이 멋져요!",
      "천천히 하면 돼요, 선생님이 도와줄게요!",
    ]},
    { words: ["세모", "삼각"], responses: [
      "삼각형을 잘 알고 있구나!",
      "뾰족뾰족 세모를 잘 찾았어요!",
    ]},
    { words: ["네모", "사각"], responses: [
      "네모를 잘 찾았어요!",
      "관찰력이 정말 뛰어나구나!",
    ]},
    { words: ["동그라미", "원", "공"], responses: [
      "동그란 모양을 잘 찾았네!",
      "둥글둥글, 잘 알고 있구나!",
    ]},
    { words: ["공주", "마리"], responses: [
      "마리 공주랑 함께하니 더 신나죠!",
      "우리도 공주처럼 모험 중이에요!",
    ]},
  ],

  // '네/아니오' 짧은 응답 → 한 마디 공감만
  yesNo: {
    positive: [
      "좋아요, 선생님도 같은 마음이에요!",
      "우리 홈런이랑 통했네!",
      "반가운 대답이에요!",
    ],
    negative: [
      "그렇구나, 괜찮아요!",
      "솔직하게 말해줘서 고마워요.",
      "괜찮아요, 천천히 해봐요!",
    ],
  },

  // 길이별 일반 공감
  long: [
    "멋진 생각이에요!",
    "홈런이 생각이 정말 깊구나!",
    "선생님이 너무 뿌듯해요!",
  ],
  medium: [
    "잘 생각했어요!",
    "멋진 대답이에요!",
    "선생님이랑 통하는 부분이 있네!",
  ],
  short: [
    "좋아요!",
    "그렇구나!",
    "고마워요!",
  ],
};

const YES_WORDS = ["네", "응", "예", "좋아", "좋아요", "맞아", "맞아요", "그래", "그래요", "당연"];
const NO_WORDS = ["아니", "아니요", "아니오", "싫어", "싫어요", "몰라", "별로"];

// ── 마이크 입력 시에만 붙는 목소리 칭찬 (키보드 입력 시 사용 안 함) ──
const MIC_PRAISE = [
  "우리 홈런이 목소리가 정말 맑고 예쁘네!",
  "홈런이 목소리로 들으니까 선생님이 더 기분이 좋아져요!",
  "또박또박 말해줘서 고마워!",
];

function randPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 학생 답변 → 공감 멘트 생성
 * - 마이크 입력: 목소리 칭찬 + 공감
 * - 키보드 입력: 공감만 (목소리 언급 없이 내용에 집중)
 */
function buildEmpathy(studentText, currentPassage, lastTeacherText, viaMic) {
  if (!studentText) return "";

  const wasReadingRequest = isReadingRequest(lastTeacherText);
  const trimmed = studentText.trim();

  // 낭독 칭찬 풀: 마이크 + 횟수 남음 → 목소리 칭찬, 아니면 일반 칭찬
  const canVoicePraise = viaMic && voicePraiseCount < VOICE_PRAISE_LIMIT;
  const readingPool = canVoicePraise ? READING_PRAISE_MIC : READING_PRAISE;

  // 1) 읽기 요청 맥락
  if (wasReadingRequest) {
    if (trimmed.length < 5) return randPick(READING_SHORT_FALLBACK);
    if (canVoicePraise) voicePraiseCount++;
    return randPick(readingPool);
  }

  // 2) 지문과 80% 이상 일치 → 자발적 낭독
  if (
    currentPassage &&
    similarity(trimmed, currentPassage) >= 0.8 &&
    trimmed.length >= 10
  ) {
    if (canVoicePraise) voicePraiseCount++;
    return randPick(readingPool);
  }

  // 내용 공감 멘트 결정
  let contentEmpathy = "";

  // 3) 짧은 네/아니오
  if (trimmed.length < 8) {
    if (YES_WORDS.some((w) => trimmed.includes(w))) {
      contentEmpathy = randPick(EMPATHY.yesNo.positive);
    } else if (NO_WORDS.some((w) => trimmed.includes(w))) {
      contentEmpathy = randPick(EMPATHY.yesNo.negative);
    }
  }

  // 4) 키워드 매칭
  if (!contentEmpathy) {
    for (const group of EMPATHY.keyword) {
      if (group.words.some((w) => trimmed.includes(w))) {
        contentEmpathy = randPick(group.responses);
        break;
      }
    }
  }

  // 5) 길이별 일반 공감
  if (!contentEmpathy) {
    let pool;
    if (trimmed.length >= 30) pool = EMPATHY.long;
    else if (trimmed.length >= 5) pool = EMPATHY.medium;
    else pool = EMPATHY.short;
    contentEmpathy = randPick(pool);
  }

  // 마이크 입력 + 횟수 남음 → 목소리 칭찬을 앞에 붙임
  if (viaMic && voicePraiseCount < VOICE_PRAISE_LIMIT) {
    voicePraiseCount++;
    return randPick(MIC_PRAISE) + " " + contentEmpathy;
  }

  // ★ 최종 안전장치: 키보드인데 목소리 관련 표현이 섞여 있으면 제거
  const voiceWords = /목소리|또박또박 말|말해줘서 고마|예쁜 목소리/g;
  if (voiceWords.test(contentEmpathy)) {
    contentEmpathy = contentEmpathy.replace(voiceWords, "").replace(/\s{2,}/g, " ").trim();
    if (!contentEmpathy) contentEmpathy = randPick(EMPATHY.short);
  }

  return contentEmpathy;
}

// ── 시나리오 앞 감탄사/추임새 정리 ──
const FILLER_PATTERN =
  /^(하[~!]?\s+|아[~!]?\s+|아하[~!]?\s*|오[~!]?\s+|와[~!]?\s*|우와[~!]?\s*|맞아요[~!.,]?\s*|좋아요[~!.,]?\s*|그렇군요[~!.,]?\s*|그렇구나[~!.,]?\s*|네[~!.,]?\s*|좋았어[~!.,]?\s*)/;

function trimFillerFromScenario(scenarioText) {
  return scenarioText.replace(FILLER_PATTERN, "").trim();
}

// ── 칭찬 표현 패턴 (공감 멘트와 시나리오 사이 중복 감지용) ──
const PRAISE_PHRASES = [
  "잘 읽었어요", "잘 읽어주었", "잘 읽었",
  "멋져요", "멋진", "멋지",
  "대단해요", "대단하",
  "잘했어요", "잘했어", "잘 했어",
  "정확해요", "정확하",
  "잘 찾았", "잘 알고",
];

/**
 * 시나리오 대사 앞부분에서 공감 멘트와 중복되는 칭찬 문장을 제거한다.
 * "잘 읽었어요. 지붕 모양이..." → "지붕 모양이..."
 */
function removeDuplicatePraise(empathy, scenarioText) {
  // 공감 멘트에 칭찬이 포함돼 있는지 확인
  const empathyHasPraise = PRAISE_PHRASES.some((p) => empathy.includes(p));
  if (!empathyHasPraise) return scenarioText;

  // 시나리오 앞부분도 칭찬으로 시작하면 그 문장을 통째로 제거
  // "잘 읽었어요. 지붕 모양이..." → 첫 문장 종결(.!?) 까지 제거
  const scenarioStart = scenarioText.slice(0, 30);
  const scenarioHasPraise = PRAISE_PHRASES.some((p) => scenarioStart.includes(p));

  if (!scenarioHasPraise) return scenarioText;

  // 첫 문장(마침표/느낌표/물음표까지)을 제거
  const afterFirstSentence = scenarioText.replace(/^[^.!?]*[.!?]\s*/, "");
  return afterFirstSentence || scenarioText; // 빈 문자열 방지
}

// ── 자연스러운 전환어 ──
const TRANSITIONS = [
  "그럼", "자,", "그러면",
];

/**
 * 공감 멘트 + 시나리오 대사를 자연스럽게 이어 붙인다.
 * 1. 시나리오 앞 감탄사 제거
 * 2. 공감↔시나리오 칭찬 중복 제거
 * 3. 필요 시 전환어로 연결
 */
function mergeEmpathyAndScenario(empathy, scenarioText) {
  if (!empathy) return scenarioText;
  if (!scenarioText) return empathy;

  let cleaned = trimFillerFromScenario(scenarioText);
  cleaned = removeDuplicatePraise(empathy, cleaned);

  // 시나리오 대사가 이미 자연 전환어로 시작하면 전환어 추가하지 않음
  const startsWithTransition =
    /^(그럼|자[,\s]|그러면|이제|이번엔|다음|우리)/.test(cleaned);

  if (startsWithTransition) {
    return empathy + " " + cleaned;
  }

  // 시나리오가 질문/내용 서술로 바로 시작하면 전환어로 연결
  const transition = randPick(TRANSITIONS);
  return empathy + " " + transition + " " + cleaned;
}

// ========== Gemini API 공감 호출 ==========

/**
 * 시나리오에서 다음 선생님 대사를 미리 찾는다.
 * (Gemini가 자연스럽게 연결할 수 있도록 맥락 제공용)
 */
function peekNextTeacherText(fromIndex) {
  for (let i = fromIndex; i < scenarioData.length; i++) {
    if (scenarioData[i]["역할"] !== "학생") {
      return scenarioData[i]["발화"] || "";
    }
  }
  return "";
}

/**
 * Gemini API를 호출하여 아이의 답변에 대한 공감 멘트를 생성한다.
 * API 키가 없거나 호출 실패 시 기존 로컬 공감 시스템(buildEmpathy)으로 자동 폴백.
 */
async function callGeminiForEmpathy(studentText, lastTeacherText, nextTeacherText, currentPassage, viaMic) {
  // API 키가 없으면 로컬 공감 사용
  if (!GEMINI_API_KEY) {
    return buildEmpathy(studentText, currentPassage, lastTeacherText, viaMic);
  }

  const systemPrompt = [
    "너는 초등 독서상담가 '로즈 선생님'이야.",
    "아이의 말을 경청하고 칭찬해준 뒤, 자연스럽게 다음 질문으로 대화를 이끌어가야 해.",
    "",
    "반드시 지켜야 할 규칙:",
    "- 아이의 답변에 대해 따뜻하고 다정하게 1~2문장으로 공감하거나 칭찬해줘.",
    "- 절대로 네가 새로운 질문을 만들지 마. 다음에 이어질 시나리오 대사가 별도로 있어.",
    "- 아이의 말을 따옴표로 그대로 반복하지 마.",
    "- 반말과 존댓말을 자연스럽게 섞어서 다정하게 말해. (예: '우와, 잘 생각했어요!')",
    "- 초등학교 저학년(1~2학년)이 이해할 수 있는 쉬운 말만 써.",
    "- 이모지, 특수문자, 마크다운 기호는 절대 쓰지 마.",
    "- 응답은 반드시 1~2문장, 최대 60자 이내로 짧게 해.",
  ].join("\n");

  const userPrompt = [
    `[선생님의 이전 질문]: ${lastTeacherText || "(없음)"}`,
    `[아이의 답변]: ${studentText}`,
    `[다음에 이어질 시나리오 대사]: ${nextTeacherText || "(없음)"}`,
    currentPassage ? `[현재 읽고 있는 지문]: ${currentPassage}` : "",
    "",
    "위 맥락을 참고하여, 아이의 답변에 대해 따뜻하게 공감하는 짧은 말만 해줘.",
  ].filter(Boolean).join("\n");

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.75,
          maxOutputTokens: 120,
        },
      }),
    });

    if (!res.ok) throw new Error(`Gemini API 오류 (${res.status})`);

    const data = await res.json();
    const geminiText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (geminiText) {
      console.log("[Gemini] 공감 응답:", geminiText);
      return geminiText;
    }
    throw new Error("빈 응답");
  } catch (err) {
    console.warn("[Gemini] API 호출 실패, 로컬 공감 사용:", err.message);
    return buildEmpathy(studentText, currentPassage, lastTeacherText, viaMic);
  }
}

// ========== CSV 파싱 ==========

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      // "" (연속 따옴표) → 이스케이프된 리터럴 따옴표
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++; // 다음 따옴표 건너뜀
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseCSVToJSON(csvText) {
  if (!csvText || csvText.trim() === "") return [];

  const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const result = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const obj = {};
    headers.forEach((header, index) => {
      obj[header.trim()] =
        values[index] !== undefined ? String(values[index]).trim() : "";
    });
    result.push(obj);
  }

  return result;
}

// ========== 이미지 경로 변환 ==========

function resolveImagePath(fileName) {
  if (!fileName || !String(fileName).trim()) return "";
  let name = String(fileName).trim();
  if (!/\.(png|jpg|jpeg|gif|webp)$/i.test(name)) {
    name = name + ".png";
  }
  return IMAGE_BASE_PATH + name;
}

// ========== HTML 포맷팅 ==========

function formatHtmlContent(text) {
  if (!text) return "";
  const s = String(text);
  const br = "___BR___";
  return s
    .replace(/<br\s*\/?>/gi, br)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/___BR___/g, "<br>");
}

// ========== DOM 조작 ==========

function showMessage(speaker, content) {
  const chatMessages = document.getElementById("chatMessages");
  const wrap = document.createElement("div");
  wrap.className =
    "message-wrapper" +
    (speaker === "학생" ? " message-student" : "") +
    " message-enter";

  const speakerEl = document.createElement("div");
  speakerEl.className = "message-speaker";
  speakerEl.textContent = speaker;

  const contentEl = document.createElement("div");
  contentEl.className = "message-content";
  contentEl.innerHTML = formatHtmlContent(content || "");

  wrap.appendChild(speakerEl);
  wrap.appendChild(contentEl);
  chatMessages.appendChild(wrap);

  // 등장 애니메이션 트리거 (다음 프레임에서 클래스 제거 → transition 시작)
  requestAnimationFrame(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
    requestAnimationFrame(() => {
      wrap.classList.remove("message-enter");
    });
  });
}

/**
 * 좌측 패널(이미지+지문) 업데이트
 */
function updateLeftPanel(step) {
  const passageContent = document.getElementById("passageContent");
  const sceneImage = document.getElementById("sceneImage");
  const imagePlaceholder = document.getElementById("imagePlaceholder");

  const imageFileName = step["이미지"] || "";
  const passage = step["지문"] || "";
  const content = step["발화"] || "";

  // 지문 영역
  const passageText = passage || content;
  if (passageText) {
    passageContent.innerHTML = formatHtmlContent(passageText);
    passageContent.style.display = "block";
  } else {
    passageContent.style.display = "none";
  }

  // 이미지 영역
  const imagePath = resolveImagePath(imageFileName);
  if (imagePath) {
    sceneImage.src = imagePath;
    sceneImage.alt = "장면 이미지";
    sceneImage.style.display = "block";
    imagePlaceholder.style.display = "none";
  } else {
    sceneImage.removeAttribute("src");
    sceneImage.style.display = "none";
    imagePlaceholder.style.display = "none";
  }
}

/**
 * ms 밀리초 대기 (async/await용)
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 읽기 상태 표시 ON/OFF
 */
function setReadingState(on) {
  const teacherArea = document.querySelector(".teacher-area");
  if (on) {
    teacherArea.classList.add("is-reading");
  } else {
    teacherArea.classList.remove("is-reading");
  }
}

/**
 * 선생님 발화를 순차 표시하다가 학생 차례가 오면 멈춤
 * @param {string} pendingEmpathy - 학생 답변에 대한 공감 멘트 (첫 대사에 병합)
 */
async function advanceTeacher(pendingEmpathy = "") {
  const sendBtn = document.getElementById("sendBtn");
  const studentInput = document.getElementById("studentInput");

  if (isAdvancing) return;

  sendBtn.disabled = true;
  studentInput.disabled = true;
  isAdvancing = true;

  // 짧은 공감이면 빠르게 반응 (네/아니오 등 단답형)
  const isShortReply = pendingEmpathy && pendingEmpathy.length < 25;

  let teacherCount = 0;
  let prevText = "";

  while (currentIndex < scenarioData.length) {
    const step = scenarioData[currentIndex];
    const role = step["역할"] || "";

    // 학생 차례 → 입력 대기
    if (role === "학생") {
      setReadingState(false);
      unlockInput();
      sendBtn.disabled = false;
      studentInput.disabled = false;
      studentInput.value = "";
      studentInput.placeholder = PLACEHOLDER_DEFAULT;
      studentInput.focus();
      isAdvancing = false;
      return;
    }

    // 두 번째 대사부터 대기
    if (teacherCount > 0) {
      if (prevText.includes(READING_TRIGGER)) {
        setReadingState(true);
        const passage = step["지문"] || step["발화"] || "";
        await speakTeacher(passage);
        setReadingState(false);
      } else {
        // 첫 대사 직후(teacherCount===1)이고 단답형이면 빠른 반응
        const ms = (teacherCount === 1 && isShortReply)
          ? TEACHER_DELAY_SHORT_MS
          : TEACHER_DELAY_MS;
        await delay(ms);
      }
    }

    let text = step["발화"] || "";

    // 첫 번째 선생님 대사에 공감 멘트 병합
    if (teacherCount === 0 && pendingEmpathy) {
      text = mergeEmpathyAndScenario(pendingEmpathy, text);
      pendingEmpathy = "";
    }

    showMessage(role || "선생님", text);
    updateLeftPanel(step);

    // TTS로 읽어주고 끝날 때까지 대기
    await speakTeacher(text);

    prevText = step["발화"] || ""; // 원본 텍스트로 트리거 체크
    currentIndex++;
    teacherCount++;
  }

  // 시나리오 끝
  setReadingState(false);
  await delay(TEACHER_DELAY_MS);
  const endMsg = "오늘 독서 상담이 끝났어요. 수고했어요!";
  showMessage("선생님", endMsg + " 🌸");
  await speakTeacher(endMsg);
  studentInput.placeholder = PLACEHOLDER_END;
  isAdvancing = false;
}

/**
 * 입력창을 강제로 비우고 초기 상태로 복원한다.
 * STT onresult가 뒤늦게 덮어쓰지 못하도록 잠금 플래그를 건다.
 */
let inputLocked = false;

function clearAndLockInput() {
  const studentInput = document.getElementById("studentInput");
  const sendBtn = document.getElementById("sendBtn");

  inputLocked = true;                              // STT 쓰기 차단
  studentInput.value = "";                          // 즉시 비우기
  studentInput.placeholder = PLACEHOLDER_DEFAULT;   // 안내문구 복원
  sendBtn.disabled = true;
  studentInput.disabled = true;
}

function unlockInput() {
  inputLocked = false;
}

/**
 * 학생 전송 처리 (Gemini 공감 + 시나리오 병합)
 */
async function handleSend() {
  const studentInput = document.getElementById("studentInput");

  // 선생님 발화 진행 중이면 무시
  if (isAdvancing) return;
  if (currentIndex >= scenarioData.length) return;

  const step = scenarioData[currentIndex];
  const text = studentInput.value.trim();

  // ★ 입력 방식 판별: 녹음 중이거나 STT로 텍스트가 들어온 경우만 true
  const isVoice = usedSTT === true;
  usedSTT = false; // 즉시 초기화 (다음 입력에 영향 없도록)

  // 녹음 중이면 정지 (이 시점 이후 onresult가 와도 usedSTT는 이미 false)
  if (isListening) stopListening();

  // ★ 전송 클릭 즉시: 입력창 비우기 + 잠금
  clearAndLockInput();

  // 학생 말풍선 표시 (빈 입력이면 말풍선 없이 바로 넘어감)
  if (text) {
    showMessage("학생", text);
  }
  updateLeftPanel(step);

  // 공감 멘트 생성 (입력이 있을 때만) → advanceTeacher에 전달
  let empathy = "";
  if (text) {
    const passage = step["지문"] || step["발화"] || "";
    let lastTeacherText = "";
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (scenarioData[i]["역할"] !== "학생") {
        lastTeacherText = scenarioData[i]["발화"] || "";
        break;
      }
    }
    // 다음 선생님 대사를 미리 조회 (Gemini 맥락 제공용)
    const nextTeacherText = peekNextTeacherText(currentIndex + 1);

    // Gemini API 호출 (실패 시 로컬 공감으로 자동 폴백)
    empathy = await callGeminiForEmpathy(
      text, lastTeacherText, nextTeacherText, passage, isVoice
    );
  }

  // 학생 행 넘기고 다음 선생님 발화로 (공감 멘트 전달)
  currentIndex++;
  advanceTeacher(empathy);
}

/**
 * 시나리오 CSV만 미리 로드 (화면 표시는 아직 안 함)
 */
async function preloadData() {
  const sendBtn = document.getElementById("sendBtn");
  const studentInput = document.getElementById("studentInput");

  try {
    sendBtn.disabled = true;
    studentInput.disabled = true;
    studentInput.placeholder = PLACEHOLDER_LOADING;

    const res = await fetch(CSV_PATH);
    if (!res.ok) throw new Error(`CSV 로드 실패 (${res.status})`);
    const csvText = await res.text();

    scenarioData = parseCSVToJSON(csvText);

    if (scenarioData.length > 0 && scenarioData[0].hasOwnProperty("순서")) {
      scenarioData.sort((a, b) => {
        return (parseInt(a["순서"], 10) || 0) - (parseInt(b["순서"], 10) || 0);
      });
    }

    if (scenarioData.length === 0) {
      showMessage("선생님", "시나리오 데이터가 없어요. CSV를 확인해 주세요.");
    }
  } catch (err) {
    console.error(err);
    showMessage(
      "시스템",
      "데이터를 불러오지 못했어요. 페이지를 새로고침 해 주세요."
    );
  }
}

/**
 * 브라우저 오디오 정책 해제 후 시나리오 시작
 * [시작하기] 버튼 클릭 시 호출됨
 */
function activateAudioAndStart() {
  // 1) 브라우저 speechSynthesis 잠금 해제 (사용자 제스처 컨텍스트 내)
  if (window.speechSynthesis) {
    speechSynthesis.cancel();
    const unlock = new SpeechSynthesisUtterance("");
    unlock.volume = 0;
    speechSynthesis.speak(unlock);
  }

  // 2) 오버레이 페이드아웃
  const overlay = document.getElementById("startOverlay");
  overlay.classList.add("is-hidden");
  setTimeout(() => {
    overlay.style.display = "none";
  }, 500);

  // 3) 데이터가 로드됐으면 첫 인사 시작
  if (scenarioData.length > 0) {
    currentIndex = 0;
    advanceTeacher();
  }
}

// ========== 음성 합성 (TTS) ==========

let ttsVoice = null;
let ttsReady = false;

/**
 * TTS 초기화 - 한국어 여성 목소리를 찾아 설정
 */
function initTTS() {
  if (!window.speechSynthesis) return;

  const pickVoice = () => {
    const voices = speechSynthesis.getVoices();
    const koVoices = voices.filter((v) => v.lang.startsWith("ko"));
    if (koVoices.length === 0) return;

    // 우선순위별 선택 (위가 최우선)
    // 1순위: Natural 또는 Online 포함 (예: Microsoft SunHi Online (Natural))
    // 2순위: Google 한국어
    // 3순위: 여성 음성 키워드
    // 4순위: 시스템 기본 한국어
    const rank = (v) => {
      const n = v.name.toLowerCase();
      if (n.includes("natural"))  return 1;
      if (n.includes("online"))   return 2;
      if (n.includes("google"))   return 3;
      const femaleHints = ["female", "여성", "여자", "yuna", "sunhi", "sun-hi", "heami", "jian"];
      if (femaleHints.some((h) => n.includes(h))) return 4;
      return 5;
    };

    koVoices.sort((a, b) => rank(a) - rank(b));
    ttsVoice = koVoices[0];
    ttsReady = true;

    console.log("[TTS] 선택된 음성:", ttsVoice.name, "| 전체 한국어:", koVoices.map((v) => v.name).join(", "));
  };

  // 음성 목록은 비동기로 로드되는 브라우저가 많음
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

/**
 * HTML 태그를 제거하여 읽기용 순수 텍스트로 변환
 */
function stripHtmlForTTS(text) {
  return String(text || "")
    .replace(/<br\s*\/?>/gi, ", ")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[~…]/g, " ")           // 물결표·말줄임표 → 자연스러운 끊김
    .replace(/[""''「」]/g, "")       // 따옴표·괄호 기호 제거
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 선생님 대사를 음성으로 읽어준다.
 * Promise를 반환하여 읽기가 끝날 때까지 대기할 수 있다.
 */
function speakTeacher(text) {
  return new Promise((resolve) => {
    if (!ttsReady || !text) {
      resolve();
      return;
    }

    // STT가 켜져 있으면 TTS 재생 전 잠시 정지 (마이크 피드백 방지)
    const wasListening = isListening;
    if (wasListening) stopListening();

    // 이전 발화가 남아 있으면 취소
    speechSynthesis.cancel();

    const plain = stripHtmlForTTS(text);
    if (!plain) {
      resolve();
      return;
    }

    const utter = new SpeechSynthesisUtterance(plain);
    utter.voice = ttsVoice;
    utter.lang = "ko-KR";
    utter.rate = 0.95;      // 자연스러운 속도
    utter.pitch = 1.1;      // 살짝 높은 톤 → 다정한 선생님
    utter.volume = 1.0;

    utter.onend = () => {
      // TTS 종료 후 STT가 켜져 있었으면 복원
      if (wasListening) startListening();
      resolve();
    };

    utter.onerror = () => {
      if (wasListening) startListening();
      resolve();
    };

    speechSynthesis.speak(utter);
  });
}

// ========== 음성 인식 (STT) ==========

let recognition = null;
let isListening = false;
let silenceTimer = null;            // 무음 감지 타이머
const SILENCE_TIMEOUT_MS = 1500;    // 1.5초 무음 → 자동 전송

function initSTT() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    document.getElementById("micBtn").style.display = "none";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "ko-KR";
  recognition.continuous = true;          // 긴 문장도 끊기지 않도록
  recognition.interimResults = true;      // 실시간 중간 결과 표시
  recognition.maxAlternatives = 1;

  let confirmedText = "";

  recognition.onresult = (event) => {
    if (inputLocked) return;

    usedSTT = true;
    const studentInput = document.getElementById("studentInput");
    let interim = "";

    // 확정 결과 누적 + 중간 결과 표시
    confirmedText = "";
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        confirmedText += result[0].transcript;
      } else {
        interim += result[0].transcript;
      }
    }

    studentInput.value = confirmedText + interim;
    studentInput.scrollTop = studentInput.scrollHeight;

    // 확정 결과가 나올 때마다 무음 타이머 리셋
    clearTimeout(silenceTimer);
    if (confirmedText) {
      silenceTimer = setTimeout(() => {
        if (isListening && studentInput.value.trim()) {
          stopListening();
          handleSend();
        }
      }, SILENCE_TIMEOUT_MS);
    }
  };

  recognition.onstart = () => {
    confirmedText = "";
  };

  recognition.onend = () => {
    // continuous 모드에서 예기치 않게 끊기면 재시작
    if (isListening) {
      try {
        recognition.start();
      } catch (e) {
        stopListening();
      }
    }
  };

  recognition.onerror = (event) => {
    console.warn("STT 오류:", event.error);
    if (event.error === "no-speech") {
      // 아무 말도 안 함 → 다시 대기
      if (isListening) {
        try { recognition.start(); } catch (e) { stopListening(); }
      }
    } else if (event.error !== "aborted") {
      stopListening();
    }
  };
}

function startListening() {
  if (!recognition || isListening || isAdvancing) return;

  // ★ 최우선: 인식 엔진을 0지연으로 즉시 시작
  isListening = true;
  try {
    recognition.start();
  } catch (e) {
    isListening = false;
    return;
  }

  // UI 업데이트는 엔진 시작 후 처리 (체감 지연 제거)
  usedSTT = false;
  const micBtn = document.getElementById("micBtn");
  const studentInput = document.getElementById("studentInput");
  micBtn.classList.add("is-recording");
  studentInput.classList.add("is-listening");
  studentInput.placeholder = PLACEHOLDER_LISTENING;
  studentInput.value = "";
}

function stopListening() {
  clearTimeout(silenceTimer);
  if (!isListening) return;

  const micBtn = document.getElementById("micBtn");
  const studentInput = document.getElementById("studentInput");

  isListening = false;
  micBtn.classList.remove("is-recording");
  studentInput.classList.remove("is-listening");
  studentInput.placeholder = PLACEHOLDER_DEFAULT;

  try {
    recognition.stop();
  } catch (e) {
    // 이미 정지된 경우 무시
  }
}

function toggleListening() {
  if (isListening) {
    // 녹음 중 다시 누르면: 텍스트가 있으면 즉시 전송, 없으면 취소
    const studentInput = document.getElementById("studentInput");
    const hasText = studentInput.value.trim();
    stopListening();
    if (hasText) handleSend();
  } else {
    startListening();
  }
}

// ========== 이벤트 바인딩 ==========

document.addEventListener("DOMContentLoaded", () => {
  const sendBtn = document.getElementById("sendBtn");
  const micBtn = document.getElementById("micBtn");
  const studentInput = document.getElementById("studentInput");
  const sceneImage = document.getElementById("sceneImage");
  const imagePlaceholder = document.getElementById("imagePlaceholder");

  // TTS·STT 초기화
  initTTS();
  initSTT();

  // 마이크 버튼 - 외부 앱(노션 받아쓰기 등) 간섭 차단
  micBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    toggleListening();
  }, true);

  // 마이크 버튼의 mousedown/pointerdown도 차단 (OS 단축키 가로채기 방지)
  ["mousedown", "pointerdown", "touchstart"].forEach((evt) => {
    micBtn.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }, true);
  });

  // ★ 키보드 입력 감지: 타이핑하는 순간 STT 플래그 강제 해제
  studentInput.addEventListener("input", () => {
    // STT onresult도 value를 바꾸지만, 그때는 inputLocked 또는 isListening 상태
    // 사용자가 직접 타이핑하면 isListening=false 이므로 여기서 리셋
    if (!isListening) {
      usedSTT = false;
    }
  });

  // 전송 버튼
  sendBtn.addEventListener("click", () => {
    if (isListening) stopListening();
    handleSend();
  });

  // Enter로 전송 (Shift+Enter는 줄바꿈)
  studentInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isListening) stopListening();
      handleSend();
    }
  });

  sceneImage.addEventListener("error", () => {
    sceneImage.removeAttribute("src");
    sceneImage.style.display = "none";
    imagePlaceholder.style.display = "none";
  });

  // 시작 버튼: 클릭 시 오디오 활성화 + 시나리오 시작
  const startBtn = document.getElementById("startBtn");
  startBtn.addEventListener("click", activateAudioAndStart);

  // CSV 데이터를 미리 로드 (시작 버튼 클릭 전에 준비)
  preloadData();
});
