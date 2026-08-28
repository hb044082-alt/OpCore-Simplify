const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const { execSync } = require('child_process');
const readline = require('readline');
const AdmZip = require('adm-zip'); // Note: run `npm install adm-zip` if needed, or use native extraction

class Updater {
    constructor() {
        this.shaVersionPath = path.join(__dirname, "sha_version.txt");
        this.downloadRepoUrl = "https://github.com/lzhoang2801/OpCore-Simplify/archive/refs/heads/main.zip";
        this.temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-simplify-'));
        this.currentStep = 0;
    }

    async question(query) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        return new Promise(resolve => rl.question(query, ans => {
            rl.close();
            resolve(ans.trim());
        }));
    }

    head(title = "") {
        console.clear();
        console.log("==================================================");
        console.log(` OpCore-Simplify Updater ${title ? `- ${title}` : ''}`);
        console.log("==================================================\n");
    }

    getCurrentShaVersion() {
        console.log("Checking current version...");
        try {
            if (!fs.existsSync(this.shaVersionPath)) {
                console.log("SHA version information is missing.");
                return "missing_sha_version";
            }
            return fs.readFileSync(this.shaVersionPath, 'utf8').trim();
        } catch (e) {
            console.log(`Error reading current SHA version: ${e.message}`);
            return "error_reading_sha_version";
        }
    }

    async getLatestShaVersion() {
        console.log("Fetching latest version from GitHub...");
        return new Promise((resolve) => {
            const url = "https://api.github.com/repos/lzhoang2801/OpCore-Simplify/commits?per_page=1";
            const options = {
                headers: { 'User-Agent': 'OpCore-Simplify-Node' }
            };

            https.get(url, options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const commits = JSON.parse(data);
                        if (Array.isArray(commits) && commits.length > 0) {
                            resolve(commits[0].sha);
                        } else {
                            resolve(null);
                        }
                    } catch (e) {
                        resolve(null);
                    }
                });
            }).on('error', () => resolve(null));
        });
    }

    async downloadFile(url, dest) {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(dest);
            const protocol = url.startsWith('https') ? https : http;
            
            protocol.get(url, { headers: { 'User-Agent': 'OpCore-Simplify-Node' } }, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    return this.downloadFile(response.headers.location, dest).then(resolve).catch(reject);
                }
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(true);
                });
            }).on('error', (err) => {
                fs.unlink(dest, () => {});
                reject(err);
            });
        });
    }

    async downloadUpdate() {
        this.currentStep++;
        console.log(`\nStep ${this.currentStep}: Creating temporary directory...`);
        try {
            if (!fs.existsSync(this.temporaryDir)) {
                fs.mkdirSync(this.temporaryDir, { recursive: true });
            }
            console.log("  Temporary directory created.");

            this.currentStep++;
            console.log(`Step ${this.currentStep}: Downloading update package...`);
            const filePath = path.join(this.temporaryDir, path.basename(this.downloadRepoUrl));
            
            await this.downloadFile(this.downloadRepoUrl, filePath);

            if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
                const fileSizeKB = (fs.statSync(filePath).size / 1024).toFixed(1);
                console.log(`  Update package downloaded (${fileSizeKB} KB)`);

                this.currentStep++;
                console.log(`Step ${this.currentStep}: Extracting files...`);
                
                // Using AdmZip for extraction (ensure 'adm-zip' package is installed)
                const zip = new AdmZip(filePath);
                zip.extractAllTo(this.temporaryDir, true);
                console.log("  Files extracted successfully");
                return true;
            } else {
                console.log("  Download failed or file is empty");
                return false;
            }
        } catch (e) {
            console.log(`  Error during download/extraction: ${e.message}`);
            return false;
        }
    }

    updateFiles() {
        this.currentStep++;
        console.log(`Step ${this.currentStep}: Updating files...`);
        try {
            let targetDir = path.join(this.temporaryDir, "OpCore-Simplify-main");
            if (!fs.existsSync(targetDir)) {
                targetDir = path.join(this.temporaryDir, "main", "OpCore-Simplify-main");
            }

            if (!fs.existsSync(targetDir)) {
                console.log("  Could not locate extracted files directory");
                return false;
            }

            const getAllFiles = (dir, fileList = []) => {
                fs.readdirSync(dir).forEach(file => {
                    const filePath = path.join(dir, file);
                    if (fs.statSync(filePath).isDirectory()) {
                        getAllFiles(filePath, fileList);
                    } else {
                        fileList.push(filePath);
                    }
                });
                return fileList;
            };

            const filePaths = getAllFiles(targetDir);
            const totalFiles = filePaths.length;
            console.log(`  Found ${totalFiles} files to update`);

            let updatedCount = 0;
            filePaths.forEach((sourcePath, index) => {
                const relativePath = path.relative(targetDir, sourcePath);
                const destinationPath = path.join(__dirname, relativePath);

                fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
                process.stdout.write(`    Updating [${index + 1}/${totalFiles}]: ${path.basename(relativePath)}\r`);

                try {
                    fs.copyFileSync(sourcePath, destinationPath);
                    updatedCount++;

                    if (path.extname(relativePath) === '.command' && process.platform !== 'win32') {
                        execSync(`chmod +x "${destinationPath}"`);
                    }
                } catch (e) {
                    console.log(`      Failed to update ${relativePath}: ${e.message}`);
                }
            });

            console.log(`\n  Successfully updated ${updatedCount}/${totalFiles} files`);

            this.currentStep++;
            console.log(`Step ${this.currentStep}: Cleaning up temporary files...`);
            fs.rmSync(this.temporaryDir, { recursive: true, force: true });
            console.log("  Cleanup complete");

            return true;
        } catch (e) {
            console.log(`  Error during file update: ${e.message}`);
            return false;
        }
    }

    saveLatestShaVersion(latestSha) {
        try {
            fs.writeFileSync(this.shaVersionPath, latestSha, 'utf8');
            this.currentStep++;
            console.log(`Step ${this.currentStep}: Version information updated.`);
            return true;
        } catch (e) {
            console.log(`Failed to save version information: ${e.message}`);
            return false;
        }
    }

    async runUpdate() {
        this.head("Check for Updates");
        console.log("");

        const currentShaVersion = this.getCurrentShaVersion();
        let latestShaVersion = await this.getLatestShaVersion();

        console.log("");

        if (!latestShaVersion) {
            console.log("Could not verify the latest version from GitHub.");
            console.log(`Current script SHA version: ${currentShaVersion}`);
            console.log("Please check your internet connection and try again later.\n");

            while (true) {
                const userInput = (await this.question("Do you want to skip the update process? (yes/No): ")).trim().toLowerCase();
                if (userInput === "yes") {
                    console.log("\nUpdate process skipped.");
                    return false;
                } else if (userInput === "no") {
                    console.log("\nContinuing with update using default version check...");
                    latestShaVersion = "update_forced_by_user";
                    break;
                } else {
                    console.log("\x1b[91mInvalid selection, please try again.\x1b[0m\n\n");
                }
            }
        } else {
            console.log(`Current script SHA version: ${currentShaVersion}`);
            console.log(`Latest script SHA version: ${latestShaVersion}`);
        }

        console.log("");

        if (latestShaVersion !== currentShaVersion) {
            console.log("Update available!");
            console.log(`Updating from version ${currentShaVersion} to ${latestShaVersion}\n`);
            console.log("Starting update process...");

            if (!await this.downloadUpdate()) {
                console.log("\n  Update failed: Could not download or extract update package");
                if (fs.existsSync(this.temporaryDir)) {
                    this.currentStep++;
                    console.log(`Step ${this.currentStep}: Cleaning up temporary files...`);
                    fs.rmSync(this.temporaryDir, { recursive: true, force: true });
                    console.log("  Cleanup complete");
                }
                return false;
            }

            if (!this.updateFiles()) {
                console.log("\n  Update failed: Could not update files");
                return false;
            }

            if (!this.saveLatestShaVersion(latestShaVersion)) {
                console.log("\n  Update completed but version information could not be saved");
            }

            console.log("\nUpdate completed successfully!\n");
            console.log("The program needs to restart to complete the update process.");
            return true;
        } else {
            console.log("You are already using the latest version");
            return false;
        }
    }
}

module.exports = { Updater };

if (require.main === module) {
    (async () => {
        const updater = new Updater();
        const updateFlag = await updater.runUpdate();
        if (updateFlag) {
            console.log("Restarting application...");
            process.execArgv.push(__filename);
            execSync(`node ${process.argv.slice(1).join(' ')}`, { stdio: 'inherit' });
            process.exit(0);
        }
    })();
}
