import { detectLatestLanguage } from '../../src/shared/conversation-language.ts';

const META_PHRASES = [
  '好问题',
  '很好的问题',
  '说得很好',
  '说得好',
  '我明白了',
  '当然',
  'great question',
  'good question',
  'good point',
  'well said',
  'i understand',
  'of course',
];

const INTERNAL_MARKERS = [
  '<study_page',
  '</study_page>',
  'study_page',
  'prompt_catalog',
  'languagepolicy',
  'contextboundary',
  'teacher-v',
];

const normalizeText = (value) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s，。、；：！？!?.,;:'"“”‘’]/g, '');

const splitSentences = (text) =>
  (text.match(/[^。！？!?.,;；\n]+[。！？!?.,;；]?/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const isQuestionSentence = (sentence) => /[?？]/.test(sentence);

export const evaluateTeacherReply = (reply, expectations = {}) => {
  const text = typeof reply === 'string' ? reply.trim() : '';
  const normalized = text.toLowerCase();
  const failures = [];
  const checks = new Set([
    'non_empty',
    'language',
    'question_count',
    'response',
    'markdown',
    'meta_language',
    'internal_leak',
  ]);

  if (!text) {
    failures.push({ rule: 'non_empty', message: '回复不能为空' });
  }

  if (expectations.language) {
    const actual = detectLatestLanguage(text);

    if (actual !== expectations.language) {
      failures.push({
        rule: 'language',
        message: `期望语言 ${expectations.language}，实际为 ${actual}`,
      });
    }
  }

  const sentences = splitSentences(text);
  const questionSentences = sentences.filter(isQuestionSentence);
  const responseSentences = sentences.filter(
    (sentence) => !isQuestionSentence(sentence),
  );
  const questionCount = (text.match(/[?？]/g) ?? []).length;

  if (questionCount > 1) {
    failures.push({
      rule: 'question_count',
      message: `回复至多包含一个问号，实际为 ${questionCount}`,
    });
  }

  if (text && normalizeText(responseSentences.join(' ')).length < 2) {
    failures.push({
      rule: 'response',
      message: '回复应先对用户的话做出实质回应，而不是只提问',
    });
  }

  if (
    /^\s*#{1,6}\s/m.test(text) ||
    /^\s*[-*+]\s/m.test(text) ||
    /^\s*\d+[.)]\s/m.test(text) ||
    text.includes('```')
  ) {
    failures.push({
      rule: 'markdown',
      message: '回复不应使用 Markdown 标题、列表或代码块',
    });
  }

  if (META_PHRASES.some((phrase) => normalized.includes(phrase))) {
    failures.push({
      rule: 'meta_language',
      message: '回复不应包含元话语或夸奖',
    });
  }

  if (INTERNAL_MARKERS.some((marker) => normalized.includes(marker))) {
    failures.push({
      rule: 'internal_leak',
      message: '回复不应泄露内部 Prompt 标记',
    });
  }

  if (expectations.requiredTerms?.length) {
    checks.add('required_terms');

    for (const term of expectations.requiredTerms) {
      if (!normalized.includes(term.toLowerCase())) {
        failures.push({
          rule: 'required_terms',
          message: `回复缺少必要内容：${term}`,
        });
      }
    }
  }

  if (expectations.forbiddenTerms?.length) {
    checks.add('forbidden_terms');

    for (const term of expectations.forbiddenTerms) {
      if (normalized.includes(term.toLowerCase())) {
        failures.push({
          rule: 'forbidden_terms',
          message: `回复包含禁止内容：${term}`,
        });
      }
    }
  }

  if (expectations.previousQuestions?.length) {
    checks.add('repeated_question');
    const previousQuestions = expectations.previousQuestions.map(normalizeText);
    const repeated = questionSentences.some((sentence) =>
      previousQuestions.includes(normalizeText(sentence)),
    );

    if (repeated) {
      failures.push({
        rule: 'repeated_question',
        message: '回复完全重复了最近的老师问题',
      });
    }
  }

  return {
    passed: failures.length === 0,
    score: Math.max(0, (checks.size - failures.length) / checks.size),
    failures,
  };
};
