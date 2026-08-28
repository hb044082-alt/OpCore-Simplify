const https = require('https');
const http = require('http');

class Github {
    constructor() {}

    async _fetch(url) {
        return new Promise((resolve) => {
            const protocol = url.startsWith('https') ? https : http;
            const options = {
                headers: { 'User-Agent': 'OpCore-Simplify-Node' }
            };

            protocol.get(url, options, (res) => {
                if (res.statusCode === 302 || res.statusCode === 301) {
                    return this._fetch(res.headers.location).then(resolve);
                }
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            }).on('error', () => resolve(null));
        });
    }

    extractPayload(response) {
        const lines = response.split(/\r?\n/);
        for (const line of lines) {
            if (line.includes('type="application/json"')) {
                try {
                    const parts = line.split('>');
                    if (parts.length < 2) continue;
                    const payloadStr = parts[1].split('<')[0];
                    const jsonParsed = JSON.parse(payloadStr);
                    if (jsonParsed && jsonParsed.payload) {
                        return jsonParsed.payload;
                    }
                } catch (e) {
                    continue;
                }
            }
        }
        return null;
    }

    async getCommits(owner, repo, branch = "main", startCommit = null, after = -1) {
        if (after > -1 && !startCommit) {
            const initial = await this.getCommits(owner, repo, branch);
            startCommit = initial.currentCommit.oid;
        }

        let url;
        if (after < 0) {
            url = `https://github.com/${owner}/${repo}/commits/${branch}`;
        } else {
            url = `https://github.com/${owner}/${repo}/commits/${branch}?after=${startCommit}+${after}`;
        }

        const response = await this._fetch(url);
        if (!response) {
            throw new Error("Failed to fetch commit information from GitHub.");
        }

        const payload = this.extractPayload(response);
        if (!payload || !payload.commitGroups) {
            throw new Error(`Cannot find commit information for repository ${repo} on branch ${branch}.`);
        }

        return payload;
    }

    async getLatestRelease(owner, repo) {
        const url = `https://github.com/${owner}/${repo}/releases`;
        const response = await this._fetch(url);

        if (!response) {
            throw new Error("Failed to fetch release information from GitHub.");
        }

        const tagName = this._extractTagName(response);
        const body = this._extractBodyContent(response);

        const releaseTagUrl = `https://github.com/${owner}/${repo}/releases/expanded_assets/${tagName}`;
        const assetResponse = await this._fetch(releaseTagUrl);

        if (!assetResponse) {
            throw new Error("Failed to fetch expanded assets information from GitHub.");
        }

        const assets = this._extractAssets(assetResponse);

        return {
            body: body,
            assets: assets
        };
    }

    _extractTagName(response) {
        const lines = response.split(/\r?\n/);
        for (const line of lines) {
            if (line.includes("<a") && line.includes('href="') && line.includes("/releases/tag/")) {
                try {
                    return line.split("/releases/tag/")[1].split('"')[0];
                } catch (e) {
                    continue;
                }
            }
        }
        return null;
    }

    _extractBodyContent(response) {
        const lines = response.split(/\r?\n/);
        for (const line of lines) {
            if (line.includes("<div") && line.includes("body-content")) {
                try {
                    const tagStart = line.split('>')[0];
                    return response.split(tagStart, 2)[1].split("</div>", 1)[0].substring(1);
                } catch (e) {
                    continue;
                }
            }
        }
        return "";
    }

    _extractAssets(response) {
        const assets = [];
        let inLiBlock = false;
        let downloadLink = null;
        let sha256 = null;
        let assetId = null;

        const lines = response.split(/\r?\n/);
        for (const line of lines) {
            if (line.includes("<li")) {
                inLiBlock = true;
                downloadLink = null;
                sha256 = null;
                assetId = null;
            } else if (inLiBlock && line.includes("</li")) {
                if (downloadLink && assetId) {
                    const fileName = downloadLink.split("/").pop();
                    assets.push({
                        product_name: this.extractAssetName(fileName),
                        id: parseInt(assetId, 10),
                        url: "https://github.com" + downloadLink,
                        sha256: sha256
                    });
                }
                inLiBlock = false;
            }

            if (inLiBlock) {
                if (downloadLink === null && line.includes("<a") && line.includes('href="') && line.includes("/releases/download")) {
                    try {
                        downloadLink = line.split('href="', 2)[1].split('"', 1)[0];
                        if (!downloadLink.includes("tlwm") && !( !downloadLink.includes("tlwm") && !downloadLink.toUpperCase().includes("RESEARCH") && !downloadLink.toUpperCase().includes("DEBUG") )) {
                            inLiBlock = false;
                            continue;
                        }
                    } catch (e) {
                        // ignore
                    }
                }

                if (sha256 === null && line.includes("sha256:")) {
                    try {
                        sha256 = line.split("sha256:", 2)[1].split("<", 1)[0];
                    } catch (e) {
                        // ignore
                    }
                }

                if (assetId === null && line.includes("<relative-time")) {
                    assetId = this._generateAssetId(line);
                }
            }
        }

        return assets;
    }

    _generateAssetId(line) {
        try {
            const datetimeStr = line.split('datetime="')[1].split('"')[0];
            const reversed = datetimeStr.split("").reverse().join("");
            const digits = reversed.replace(/\D/g, "");
            return digits.substring(0, 9);
        } catch (e) {
            let result = "";
            const chars = "0123456789";
            for (let i = 0; i < 9; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
        }
    }

    extractAssetName(fileName) {
        let endIdx = fileName.length;
        if (fileName.includes("-")) {
            endIdx = Math.min(fileName.indexOf("-"), endIdx);
        }
        if (fileName.includes("_")) {
            endIdx = Math.min(fileName.indexOf("_"), endIdx);
        }
        if (fileName.includes(".")) {
            let dotIdx = fileName.indexOf(".");
            endIdx = Math.min(dotIdx, endIdx);
            if (fileName[dotIdx] === "." && /\d/.test(fileName[dotIdx - 1])) {
                endIdx = dotIdx - 1;
            }
        }
        let assetName = fileName.substring(0, endIdx);

        if (fileName.includes("Sniffer")) {
            assetName = fileName.split(".")[0];
        }
        if (assetName === "IntelBluetooth") {
            assetName = "IntelBluetoothFirmware";
        }
        if (fileName.includes("unsupported")) {
            assetName += "-unsupported";
        } else if (fileName.includes("rtsx")) {
            assetName += "-rtsx";
        } else if (fileName.toLowerCase().includes("itlwm")) {
            if (fileName.includes("Sonoma14.4")) {
                assetName += "23.4";
            } else if (fileName.includes("Sonoma14.0")) {
                assetName += "23.0";
            } else if (fileName.includes("Ventura")) {
                assetName += "22";
            } else if (fileName.includes("Monterey")) {
                assetName += "21";
            } else if (fileName.includes("Big_Sur")) {
                assetName += "20";
            } else if (fileName.includes("Catalina")) {
                assetName += "19";
            } else if (fileName.includes("Mojave")) {
                assetName += "18";
            } else if (fileName.includes("High_Sierra")) {
                assetName += "17";
            }
        }

        return assetName;
    }
}

module.exports = { Github };
