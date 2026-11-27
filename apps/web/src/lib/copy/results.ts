/**
 * Result-flow strings (Design §9: direct, calm; say what happened and what to do).
 * Centralised so the i18n layer can take them over without touching components.
 * The confirmation-window copy is driven by the rules config, not hard-coded.
 */
export const RESULT_RULES = {
  confirmationWindowHours: 24,
  noShowGateMinutes: 20,
  noteMaxLength: 200,
} as const;

export const resultCopy = {
  sheetTitle: 'Submit result',
  noShowTitle: 'Report no-show',
  outcomeLegend: 'Outcome',
  outcomes: {
    win: 'I won',
    loss: 'I lost',
    draw: 'Draw',
    no_show: 'Opponent did not show up',
  },
  scoreLegend: 'Score',
  you: 'You',
  opponent: 'Opponent',
  screenshot: 'Screenshot',
  screenshotHelp: 'A clear photo or screenshot of the final result screen.',
  noShowScreenshotHelp:
    'A screenshot that shows you were ready, such as the lobby or an invite you sent.',
  note: 'Note (optional)',
  notePlaceholder: 'Anything the moderator should know',
  summary: (hours: number) =>
    `Your opponent has ${hours} hours to confirm. If they do not respond, the result is confirmed automatically.`,
  noShowSummary: (hours: number) =>
    `Your opponent has ${hours} hours to respond. If they do not, they forfeit the match.`,
  submit: 'Submit result',
  submitNoShow: 'Report no-show',
  needScreenshot: 'Add a screenshot to submit.',
  waitForUpload: 'Wait for the screenshot to finish uploading.',
  submitFailed: 'Could not submit the result. Check your connection and try again.',
  submitted: 'Result submitted',
  upload: {
    pick: 'Add screenshot',
    camera: 'Take photo',
    compressing: 'Preparing image…',
    uploading: (pct: number) => `Uploading ${pct}%`,
    processing: 'Checking image…',
    offline: 'You are offline. The screenshot will upload when you reconnect.',
    failed: 'Could not upload the screenshot. Check your connection and try again.',
    retry: 'Try again',
    remove: 'Remove screenshot',
    replace: 'Replace',
    ready: (kb: number) => `Screenshot added (${kb} KB)`,
  },
  confirm: {
    title: 'Your opponent submitted a result',
    claimed: (outcome: string) => `They reported: ${outcome}`,
    confirmCta: 'Confirm result',
    disagree: 'Submit a different result',
    deadline: 'Confirm by',
    noShowClaim: 'They reported that you did not show up.',
    concede: 'Accept forfeit',
  },
  waiting: {
    title: 'Waiting for your opponent',
    body: (hours: number) =>
      `They have ${hours} hours to confirm. If they do not respond, your result is confirmed automatically.`,
    autoConfirmAt: 'Auto-confirms',
  },
  disputed: {
    title: 'Results do not match',
    body: 'A dispute has been opened. A moderator will review both submissions and the match chat.',
  },
  confirmed: {
    title: 'Result confirmed',
    forfeited: 'Opponent forfeited',
    youForfeited: 'Match forfeited',
    rating: 'Rating',
    ratingPending: 'Rating updates shortly',
    rank: 'Rank',
    record: 'Record',
    viaTimeout: 'Confirmed automatically after 24 hours.',
    done: 'Done',
  },
  waitForStart: 'You can submit a result once the match starts.',
  closed: 'This match is no longer accepting results.',
  noShowCta: 'Report no-show',
  noShowAvailable: 'Report no-show from',
} as const;
