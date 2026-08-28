class MacOSVersionInfo {
    constructor(name, macosVersion, releaseStatus = "final") {
        this.name = name;
        this.macosVersion = macosVersion;
        this.releaseStatus = releaseStatus;

        if (macosVersion.includes("10.")) {
            this.darwinVersion = parseInt(macosVersion.split(".")[1], 10) + 4;
        } else if (macosVersion.startsWith("1")) {
            this.darwinVersion = parseInt(macosVersion.split(".")[0], 10) + 9;
        } else {
            this.darwinVersion = parseInt(macosVersion.split(".")[0], 10) - 1;
        }
    }
}

const macosVersions = [
    new MacOSVersionInfo("High Sierra", "10.13"),
    new MacOSVersionInfo("Mojave", "10.14"),
    new MacOSVersionInfo("Catalina", "10.15"),
    new MacOSVersionInfo("Big Sur", "11"),
    new MacOSVersionInfo("Monterey", "12"),
    new MacOSVersionInfo("Ventura", "13"),
    new MacOSVersionInfo("Sonoma", "14"),
    new MacOSVersionInfo("Sequoia", "15"),
    new MacOSVersionInfo("Tahoe", "26")
];

function getLatestDarwinVersion(includeBeta = true) {
    const reversed = [...macosVersions].reverse();
    for (const macosVersion of reversed) {
        if (includeBeta) {
            return `${macosVersion.darwinVersion}.99.99`;
        } else {
            if (macosVersion.releaseStatus === "final") {
                return `${macosVersion.darwinVersion}.99.99`;
            }
        }
    }
}

function getLowestDarwinVersion() {
    return `${macosVersions[0].darwinVersion}.0.0`;
}

function getMacosNameByDarwin(darwinVersion) {
    const majorPrefix = parseInt(darwinVersion.substring(0, 2), 10);
    for (const data of macosVersions) {
        if (data.darwinVersion === majorPrefix) {
            const betaSuffix = data.releaseStatus === "final" ? "" : " (Beta)";
            return `macOS ${data.name} ${data.macosVersion}${betaSuffix}`;
        }
    }
    return null;
}

module.exports = {
    MacOSVersionInfo,
    macosVersions,
    getLatestDarwinVersion,
    getLowestDarwinVersion,
    getMacosNameByDarwin
};
