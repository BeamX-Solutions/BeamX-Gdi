export type MessageView = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly markdown: string;
  readonly streaming: boolean;
};
