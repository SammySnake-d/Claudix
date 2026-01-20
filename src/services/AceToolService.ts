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

        // Construct arguments
        // <executable> ...<args> --enhance-prompt "<text>"
        const finalArgs = [...args, '--enhance-prompt', text];

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
                    reject(new Error(`AceTool failed: ${stderr || 'Unknown error'}`));
                }
            });

            proc.on('error', (err: Error) => {
                this.logService.error(`[AceToolService] Spawn error: ${err}`);
                reject(err);
            });
        });
    }
}
