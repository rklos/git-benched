import * as vscode from 'vscode';

export class Logger {
  private readonly channel: vscode.OutputChannel;
  private debugEnabled = false;

  public constructor() {
    this.channel = vscode.window.createOutputChannel('Git Benched');
  }

  public setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  public info(message: string, ...args: unknown[]): void {
    this.write('INFO', message, args);
  }

  public warn(message: string, ...args: unknown[]): void {
    this.write('WARN', message, args);
  }

  public error(message: string, ...args: unknown[]): void {
    this.write('ERROR', message, args);
  }

  public debug(message: string, ...args: unknown[]): void {
    if (this.debugEnabled) {
      this.write('DEBUG', message, args);
    }
  }

  public dispose(): void {
    this.channel.dispose();
  }

  private write(level: string, message: string, args: unknown[]): void {
    const timestamp = new Date().toISOString();
    const suffix = args.length > 0 ? ` ${JSON.stringify(args)}` : '';
    this.channel.appendLine(`[${timestamp}] [${level}] ${message}${suffix}`);
  }
}
