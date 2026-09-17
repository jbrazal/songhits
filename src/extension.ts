import * as vscode from 'vscode';
import { ChordMarkPreviewPanel } from './previewPanel';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('chordmark.openPreview', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        ChordMarkPreviewPanel.createOrShow(context, editor.document, vscode.ViewColumn.Active);
      }
    }),

    vscode.commands.registerCommand('chordmark.openPreviewToSide', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        ChordMarkPreviewPanel.createOrShow(context, editor.document, vscode.ViewColumn.Beside);
      }
    }),

    vscode.commands.registerCommand('chordmark.exportPdf', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) ChordMarkPreviewPanel.exportDocument(context, editor.document);
    }),

    vscode.workspace.onDidChangeTextDocument((e) => {
      ChordMarkPreviewPanel.update(e.document);
    }),

    vscode.workspace.onDidSaveTextDocument((doc) => {
      ChordMarkPreviewPanel.update(doc);
    }),

    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.languageId === 'chordmark') {
        ChordMarkPreviewPanel.update(editor.document);
      }
    })
  );
}

export function deactivate() {
  ChordMarkPreviewPanel.dispose();
}
