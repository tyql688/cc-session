export const SESSION_COMMAND_EVENTS = {
  sessionSearch: "sessionview:session-search",
  resume: "sessionview:resume",
  exportSession: "sessionview:export",
  favorite: "sessionview:favorite",
  delete: "sessionview:delete",
} as const;

export type SessionCommandEvent = (typeof SESSION_COMMAND_EVENTS)[keyof typeof SESSION_COMMAND_EVENTS];

export function dispatchSessionCommand(eventName: SessionCommandEvent): void {
  document.dispatchEvent(new CustomEvent(eventName));
}
