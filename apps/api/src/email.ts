import type { EmailProvider } from './types.js';
export class DevelopmentEmailProvider implements EmailProvider {
  readonly messages: {
    to: string;
    subject: string;
    text: string;
    createdAt: string;
  }[] = [];
  send(message: { to: string; subject: string; text: string }): Promise<void> {
    this.messages.push({ ...message, createdAt: new Date().toISOString() });
    return Promise.resolve();
  }
}
