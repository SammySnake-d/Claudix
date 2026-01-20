/**
 * AceToolService - Service for interacting with ace-tool-rs
 */

import * as vscode from 'vscode';
import * as child_process from 'child_process';
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
        const rawArgs = config.get<string[]>('args', ['ace-tool-rs', '--enhance-prompt', '${prompt}']);

        this.logService.info(`[AceToolService] Raw Config Executable: ${executable}`);
        this.logService.info(`[AceToolService] Raw Config Args: ${JSON.stringify(rawArgs)}`);

        // 1. Detect if we are running in "npx mode" or "binary mode"
        const isNpx = executable === 'npx' || executable.endsWith('/npx') || executable.endsWith('\\npx') || executable.endsWith('npx.cmd');

        // 2. Prepare the initial argument list
        let workingArgs = [...rawArgs];

        // 3. Clean up "ace-tool-rs" redundancy for binary mode
        // If we are NOT using npx, but the user copied the default args (which start with 'ace-tool-rs'),
        // we should remove that first argument to prevent "unexpected argument 'ace-tool-rs'".
        if (!isNpx && workingArgs.length > 0 && workingArgs[0] === 'ace-tool-rs') {
            this.logService.info('[AceToolService] Detected direct binary usage with "ace-tool-rs" in args. Removing redundant first argument.');
            workingArgs.shift();
        }

        // 4. Inject the prompt text
        // Strategy:
        // - Look for `${prompt}` placeholder and replace it.
        // - If NO placeholder is found, append `['--enhance-prompt', text]` to the end.
        //   (This maintains backward compatibility for simple configs, but allows full control via placeholder)

        let finalArgs: string[] = [];
        const promptPlaceholderIndex = workingArgs.findIndex(arg => arg === '${prompt}' || arg.includes('${prompt}'));

        if (promptPlaceholderIndex !== -1) {
            // Placeholder found: Replace it with the actual text
            finalArgs = workingArgs.map(arg => arg.replace('${prompt}', text));
            this.logService.info('[AceToolService] Using configured "${prompt}" placeholder position.');
        } else {
            // No placeholder: Default fallback (Append)
            // Note: If using npx, 'ace-tool-rs' is usually the first arg, so appending works.
            // If using binary, appending also usually works unless the tool demands order.
            this.logService.info('[AceToolService] No "${prompt}" placeholder found. Appending default flag "--enhance-prompt".');
            finalArgs = [...workingArgs, '--enhance-prompt', text];
        }

        this.logService.info(`[AceToolService] Final Execution Command: ${executable} ${finalArgs.join(' ')}`);

        // 5. Handle Windows npx execution quirks
        let cmd = executable;
        if (process.platform === 'win32' && cmd === 'npx') {
            cmd = 'npx.cmd';
        }

        return new Promise((resolve, reject) => {
            const proc = child_process.spawn(cmd, finalArgs, {
                env: { ...process.env },
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

                    // Log the captured output for debugging
                    if (stdout.length > 0) {
                        this.logService.info(`[AceToolService] Stdout captured (${stdout.length} chars): ${stdout.substring(0, 500)}${stdout.length > 500 ? '...' : ''}`);
                    } else {
                        this.logService.warn('[AceToolService] Stdout is empty!');
                    }

                    if (stderr.length > 0) {
                        this.logService.info(`[AceToolService] Stderr captured (${stderr.length} chars): ${stderr.substring(0, 500)}${stderr.length > 500 ? '...' : ''}`);
                    }

                    resolve(stdout.trim());
                } else {
                    this.logService.error(`[AceToolService] Failed with code ${code}`);
                    this.logService.error(`Stderr: ${stderr}`);
                    if (stdout.length > 0) {
                        this.logService.info(`Stdout before failure: ${stdout}`);
                    }

                    // Enhanced Error Reporting
                    let errorMsg = `AceTool failed (exit code ${code}): ${stderr || 'Unknown error'}`;

                    if (stderr.includes("unexpected argument")) {
                         errorMsg += `\n\n[Configuration Hint] It looks like the tool received arguments it didn't expect.\n`;
                         errorMsg += `1. Check your 'Claudix > Ace Tool > Args' setting.\n`;
                         errorMsg += `2. Ensure you are using the correct flags for your version of 'ace-tool-rs'.\n`;
                         errorMsg += `3. Use the '\${prompt}' placeholder in args to specify exactly where the prompt text goes.\n`;
                         errorMsg += `   Example: ["--base-url", "...", "--enhance-prompt", "\${prompt}"]`;
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
