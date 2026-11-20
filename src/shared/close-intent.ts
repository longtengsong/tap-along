/**
 * 讨论式伴读的收住规则。
 *
 * 主进程（真实对话与本地固定话术）和渲染层 mock 回退共用同一份判断，
 * 避免两边在「聊到第几轮建议收住」上出现偏差。
 */

/** 讨论到这个轮数后，伴读可以建议用户收住当前念头。 */
export const CLOSE_ROUND_LIMIT = 6;

/** 用户明确表示“收住 / 够了 / 换话题”的文本特征。 */
export const CLOSE_INTENT_PATTERN =
  /(收住|(?<!不)够了|不聊了|换(?:一?个)?话题|已经想明白|想明白了|先到这|到此为止|结束吧|stop here|that(?:'s| is) enough|enough for now|move on|change the (?:subject|topic)|switch topics|i(?:'ve| have) (?:got it|had enough)|i(?:'m| am) done)/i;

export const hasCloseIntent = (text: string): boolean =>
  typeof text === 'string' && CLOSE_INTENT_PATTERN.test(text);
