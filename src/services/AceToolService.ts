/**
 * AceToolService - Service for interacting with ace-tool-rs
 */

import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as os from 'os';
import { createDecorator } from '../di/instantiation';
import { ILogService } from './logService';
import { IConfigurationService } from './configurationService';

export const IAceToolService = createDecorator<IAceToolService>('aceToolService');

export interface IAceToolService {
    readonly _serviceBrand: undefined;
    enhancePrompt(text: string): Promise<string>;
}

export class AceToolService implements IAceToolService {
    readonly _serviceBrand: undefined;

    constructor(
        @ILogService private readonly logService: ILogService,
        @IConfigurationService private readonly configService: IConfigurationService
    ) {}

    async enhancePrompt(text: string): Promise<string> {
        this.logService.info('[AceToolService] Enhancing prompt...');

        const config = vscode.workspace.getConfiguration('claudix.aceTool');
        const executable = config.get<string>('executable', 'npx');
        const args = config.get<string[]>('args', ['ace-tool-rs']);

        // Check if we need to clean up args
        // If executable is NOT npx (or looks like npx), and the first arg is 'ace-tool-rs', remove it.
        // This handles the case where user changes executable to the binary path but leaves the default args.
        const finalCmdArgs = [...args];
        const isNpx = executable === 'npx' || executable.endsWith('/npx') || executable.endsWith('\\npx') || executable.endsWith('npx.cmd');

        if (!isNpx && finalCmdArgs.length > 0 && finalCmdArgs[0] === 'ace-tool-rs') {
            this.logService.info('[AceToolService] Detected direct binary usage, removing redundant "ace-tool-rs" argument.');
            finalCmdArgs.shift();
        }

        // Construct arguments
        // If args contain ${prompt}, replace it.
        // Otherwise, inject --enhance-prompt <text> smartly.
        let finalArgs: string[];
        const promptIndex = finalCmdArgs.findIndex(arg => arg.includes('${prompt}'));

        if (promptIndex !== -1) {
            finalArgs = finalCmdArgs.map(arg => arg.replace('${prompt}', text));
        } else {
            // Smart injection:
            // If the command starts with 'ace-tool-rs' (npx case), put flags after it.
            // Otherwise put flags at the beginning (binary case).
            if (finalCmdArgs.length > 0 && finalCmdArgs[0] === 'ace-tool-rs') {
                finalArgs = [finalCmdArgs[0], '--enhance-prompt', text, ...finalCmdArgs.slice(1)];
            } else {
                finalArgs = ['--enhance-prompt', text, ...finalCmdArgs];
            }
        }

        this.logService.info(`[AceToolService] Running: ${executable} ${finalArgs.join(' ')}`);

        // Determine if we need shell execution for npx on Windows, or just finding the executable.
        // Using shell: false is safer.
        // If executable is 'npx' on Windows, we might need 'npx.cmd'.
        let cmd = executable;
        if (process.platform === 'win32' && cmd === 'npx') {
            cmd = 'npx.cmd';
        }

        return new Promise((resolve, reject) => {
            const proc = child_process.spawn(cmd, finalArgs, {
                env: { ...process.env }, // inherit env
                shell: false
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data: Buffer) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            proc.on('close', (code: number) => {
                if (code === 0) {
                    this.logService.info('[AceToolService] Success');
                    resolve(stdout.trim());
                } else {
                    this.logService.error(`[AceToolService] Failed with code ${code}`);
                    this.logService.error(`Stderr: ${stderr}`);

                    let errorMsg = `AceTool failed: ${stderr || 'Unknown error'}`;
                    if (stderr.includes("unexpected argument '--enhance-prompt'")) {
                        errorMsg += "\n\nHint: The 'ace-tool-rs' binary you are using does not appear to support the default '--enhance-prompt' flag. Please check the tool's documentation or help output. You can use the '${prompt}' placeholder in the extension settings (Args) to customize the command format (e.g., replace the default flags with whatever your tool expects).";
                    }

                    reject(new Error(errorMsg));
                }
            });

            proc.on('error', (err: Error) => {
                this.logService.error(`[AceToolService] Spawn error: ${err}`);
                reject(err);
            });
        });
    }
}
