const { spawn, spawnSync } = require('child_process');
const os = require('os');
const which = require('which'); // Optional: npm install which or handle lookup manually

class Run {
    constructor() {}

    async _streamOutput(comm, shell = false) {
        return new Promise((resolve) => {
            let output = "";
            let error = "";
            let command = comm;

            if (shell && Array.isArray(command)) {
                command = command.join(" ");
            } else if (!shell && typeof command === 'string') {
                command = command.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
            }

            const executable = Array.isArray(command) ? command[0] : command;
            const args = Array.isArray(command) ? command.slice(1) : [];

            const p = spawn(executable, args, {
                shell: shell,
                stdio: ['inherit', 'pipe', 'pipe']
            });

            p.stdout.on('data', (data) => {
                const str = data.toString();
                output += str;
                process.stdout.write(str);
            });

            p.stderr.on('data', (data) => {
                const str = data.toString();
                error += str;
                process.stderr.write(str);
            });

            p.on('close', (code) => {
                resolve([output, error, code !== null ? code : 1]);
            });

            p.on('error', (err) => {
                resolve([output, error + err.message, 1]);
            });
        });
    }

    _runCommand(comm, shell = false) {
        try {
            let command = comm;
            if (shell && Array.isArray(command)) {
                command = command.join(" ");
            } else if (!shell && typeof command === 'string') {
                command = command.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
            }

            const executable = Array.isArray(command) ? command[0] : command;
            const args = Array.isArray(command) ? command.slice(1) : [];

            const result = spawnSync(executable, args, {
                shell: shell,
                encoding: 'utf-8'
            });

            if (result.error) {
                return ["", "Command not found!", 1];
            }

            return [
                result.stdout || "",
                result.stderr || "",
                result.status !== null ? result.status : 1
            ];
        } catch (e) {
            return ["", "Command not found!", 1];
        }
    }

    async run(commandList, leaveOnFail = false) {
        if (!Array.isArray(commandList)) {
            commandList = [commandList];
        }

        const outputList = [];

        for (const comm of commandList) {
            let args = comm.args || [];
            const shell = comm.shell || false;
            const stream = comm.stream || false;
            const sudo = comm.sudo || false;
            const stdout = comm.stdout || false;
            const stderr = comm.stderr || false;
            const mess = comm.message;
            const show = comm.show || false;

            if (mess !== undefined) {
                console.log(mess);
            }

            if (!args || (Array.isArray(args) && args.length === 0)) {
                continue;
            }

            if (sudo && process.platform !== 'win32') {
                try {
                    const sudoPath = which.sync('sudo');
                    if (sudoPath) {
                        if (Array.isArray(args)) {
                            args.unshift(sudoPath.trim());
                        } else if (typeof args === 'string') {
                            args = `${sudoPath.trim()} ${args}`;
                        }
                    }
                } catch (e) {
                    // sudo not found, proceed without it
                }
            }

            if (show) {
                console.log(Array.isArray(args) ? args.join(" ") : args);
            }

            let out;
            if (stream) {
                out = await this._streamOutput(args, shell);
            } else {
                out = this._runCommand(args, shell);
            }

            if (stdout && out[0].length > 0) {
                console.log(out[0]);
            }

            if (stderr && out[1].length > 0) {
                console.error(out[1]);
            }

            outputList.push(out);

            if (leaveOnFail && out[2] !== 0) {
                break;
            }
        }

        if (outputList.length === 1) {
            return outputList[0];
        }

        return outputList;
    }
}

module.exports = { Run };
