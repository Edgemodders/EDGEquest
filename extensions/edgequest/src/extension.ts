// EDGEquest's extension. Q1 skeleton: the activity bar container and the log.

import * as vscode from "vscode";

let output: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("EDGEquest");
  context.subscriptions.push(output, vscode.commands.registerCommand("edgequest.showLog", () => output.show()));
}

export function deactivate(): void {}
