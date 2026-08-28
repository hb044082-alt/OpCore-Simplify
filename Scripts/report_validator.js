const fs = require('fs');

class ReportValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.patterns = {
            "not_empty": /.+/,
            "platform": /^(Desktop|Laptop)$/,
            "firmware_type": /^(UEFI|BIOS)$/,
            "bus_type": /^(PCI|USB|ACPI|ROOT)$/,
            "cpu_manufacturer": /^(Intel|AMD)$/,
            "gpu_manufacturer": /^(Intel|AMD|NVIDIA)$/,
            "gpu_device_type": /^(Integrated GPU|Discrete GPU|Unknown)$/,
            "hex_id": /^(?:0x)?[0-9a-fA-F]+$/,
            "device_id": /^[0-9A-F]{4}(?:-[0-9A-F]{4})?$/,
            "resolution": /^\d+x\d+$/,
            "pci_path": /^PciRoot\(0x[0-9a-fA-F]+\)(?:\/Pci\(0x[0-9a-fA-F]+,0x[0-9a-fA-F]+\))+$/,
            "acpi_path": /^[\\]?_SB(\.[A-Z0-9_]+)+$/,
            "core_count": /^\d+$/,
            "connector_type": /^(VGA|DVI|HDMI|LVDS|DP|eDP|Internal|Uninitialized)$/,
            "enabled_disabled": /^(Enabled|Disabled)$/
        };

        this.schema = {
            type: Object,
            schema: {
                "Motherboard": {
                    type: Object,
                    required: true,
                    schema: {
                        "Name": { type: String },
                        "Chipset": { type: String },
                        "Platform": { type: String, pattern: this.patterns["platform"] }
                    }
                },
                "BIOS": {
                    type: Object,
                    required: true,
                    schema: {
                        "Version": { type: String, required: false },
                        "Release Date": { type: String, required: false },
                        "System Type": { type: String, required: false },
                        "Firmware Type": { type: String, pattern: this.patterns["firmware_type"] },
                        "Secure Boot": { type: String, pattern: this.patterns["enabled_disabled"] }
                    }
                },
                "CPU": {
                    type: Object,
                    required: true,
                    schema: {
                        "Manufacturer": { type: String, pattern: this.patterns["cpu_manufacturer"] },
                        "Processor Name": { type: String },
                        "Codename": { type: String },
                        "Core Count": { type: String, pattern: this.patterns["core_count"] },
                        "CPU Count": { type: String, pattern: this.patterns["core_count"] },
                        "SIMD Features": { type: String }
                    }
                },
                "GPU": {
                    type: Object,
                    required: true,
                    values_rule: {
                        type: Object,
                        schema: {
                            "Manufacturer": { type: String, pattern: this.patterns["gpu_manufacturer"] },
                            "Codename": { type: String },
                            "Device ID": { type: String, pattern: this.patterns["device_id"] },
                            "Device Type": { type: String, pattern: this.patterns["gpu_device_type"] },
                            "Subsystem ID": { type: String, required: false, pattern: this.patterns["hex_id"] },
                            "PCI Path": { type: String, required: false, pattern: this.patterns["pci_path"] },
                            "ACPI Path": { type: String, required: false, pattern: this.patterns["acpi_path"] },
                            "Resizable BAR": { type: String, required: false, pattern: this.patterns["enabled_disabled"] }
                        }
                    }
                },
                "Monitor": {
                    type: Object,
                    required: false,
                    values_rule: {
                        type: Object,
                        schema: {
                            "Connector Type": { type: String, pattern: this.patterns["connector_type"] },
                            "Resolution": { type: String, pattern: this.patterns["resolution"] },
                            "Connected GPU": { type: String, required: false }
                        }
                    }
                },
                "Network": {
                    type: Object,
                    required: true,
                    values_rule: {
                        type: Object,
                        schema: {
                            "Bus Type": { type: String, pattern: this.patterns["bus_type"] },
                            "Device ID": { type: String, pattern: this.patterns["device_id"] },
                            "Subsystem ID": { type: String, required: false, pattern: this.patterns["hex_id"] },
                            "PCI Path": { type: String, required: false, pattern: this.patterns["pci_path"] },
                            "ACPI Path": { type: String, required: false, pattern: this.patterns["acpi_path"] }
                        }
                    }
                },
                "Sound": {
                    type: Object,
                    required: false,
                    values_rule: {
                        type: Object,
                        schema: {
                            "Bus Type": { type: String },
                            "Device ID": { type: String, pattern: this.patterns["device_id"] },
                            "Subsystem ID": { type: String, required: false, pattern: this.patterns["hex_id"] },
                            "Audio Endpoints": { type: Array, required: false, item_rule: { type: String } },
                            "Controller Device ID": { type: String, required: false, pattern: this.patterns["device_id"] }
                        }
                    }
                },
                "USB Controllers": {
                    type: Object,
                    required: true,
                    values_rule: {
                        type: Object,
                        schema: {
                            "Bus Type": { type: String, pattern: this.patterns["bus_type"] },
                            "Device ID": { type: String, pattern: this.patterns["device_id"] },
                            "Subsystem ID": { type: String, required: false, pattern: this.patterns["hex_id"] },
                            "PCI Path": { type: String, required: false, pattern: this.patterns["pci_path"] },
                            "ACPI Path": { type: String, required: false, pattern: this.patterns["acpi_path"] }
                        }
                    }
                },
                "Input": {
                    type: Object,
                    required: true,
                    values_rule: {
                        type: Object,
                        schema: {
                            "Bus Type": { type: String, pattern: this.patterns["bus_type"] },
                            "Device": { type: String, required: false },
                            "Device ID": { type: String, required: false, pattern: this.patterns["device_id"] },
                            "Device Type": { type: String, required: false }
                        }
                    }
                },
                "Storage Controllers": {
                    type: Object,
                    required: true,
                    values_rule: {
                        type: Object,
                        schema: {
                            "Bus Type": { type: String, pattern: this.patterns["bus_type"] },
                            "Device ID": { type: String, pattern: this.patterns["device_id"] },
                            "Subsystem ID": { type: String, required: false, pattern: this.patterns["hex_id"] },
                            "PCI Path": { type: String, required: false, pattern: this.patterns["pci_path"] },
                            "ACPI Path": { type: String, required: false, pattern: this.patterns["acpi_path"] },
                            "Disk Drives": { type: Array, required: false, item_rule: { type: String } }
                        }
                    }
                },
                "Biometric": {
                    type: Object,
                    required: false,
                    values_rule: {
                        type: Object,
                        schema: {
                            "Bus Type": { type: String, pattern: this.patterns["bus_type"] },
                            "Device": { type: String, required: false },
                            "Device ID": { type: String, required: false, pattern: this.patterns["device_id"] }
                        }
                    }
                },
                "Bluetooth": {
                    type: Object,
                    required: false,
                    values_rule: {
                        type: Object,
                        schema: {
                            "Bus Type": { type: String, pattern: this.patterns["bus_type"] },
                            "Device ID": { type: String, pattern: this.patterns["device_id"] }
                        }
                    }
                },
                "SD Controller": {
                    type: Object,
                    required: false,
                    values_rule: {
                        type: Object,
                        schema: {
                            "Bus Type": { type: String, pattern: this.patterns["bus_type"] },
                            "Device ID": { type: String, pattern: this.patterns["device_id"] },
                            "Subsystem ID": { type: String, required: false, pattern: this.patterns["hex_id"] },
                            "PCI Path": { type: String, required: false, pattern: this.patterns["pci_path"] },
                            "ACPI Path": { type: String, required: false, pattern: this.patterns["acpi_path"] }
                        }
                    }
                },
                "System Devices": {
                    type: Object,
                    required: false,
                    values_rule: {
                        type: Object,
                        schema: {
                            "Bus Type": { type: String },
                            "Device": { type: String, required: false },
                            "Device ID": { type: String, required: false, pattern: this.patterns["device_id"] },
                            "Subsystem ID": { type: String, required: false, pattern: this.patterns["hex_id"] },
                            "PCI Path": { type: String, required: false, pattern: this.patterns["pci_path"] },
                            "ACPI Path": { type: String, required: false, pattern: this.patterns["acpi_path"] }
                        }
                    }
                }
            }
        };
    }

    validateReport(reportPath) {
        this.errors = [];
        this.warnings = [];
        let data = null;

        if (!fs.existsSync(reportPath)) {
            this.errors.push(`File does not exist: ${reportPath}`);
            return [false, this.errors, this.warnings, null];
        }

        try {
            const fileContent = fs.readFileSync(reportPath, 'utf8');
            data = JSON.parse(fileContent);
        } catch (e) {
            this.errors.push(`Invalid JSON format: ${e.message}`);
            return [false, this.errors, this.warnings, null];
        }

        const cleanedData = this._validateNode(data, this.schema, "Root");
        const isValid = this.errors.length === 0;
        return [isValid, this.errors, this.warnings, cleanedData];
    }

    _validateNode(data, rule, path) {
        const expectedType = rule.type;
        if (expectedType) {
            const isMatch = expectedType === Array ? Array.isArray(data) : typeof data === expectedType.name.toLowerCase();
            if (!isMatch) {
                const typeName = expectedType.name || String(expectedType);
                this.errors.push(`${path}: Expected type ${typeName}, got ${Array.isArray(data) ? 'array' : typeof data}`);
                return null;
            }
        }

        if (typeof data === 'string') {
            const pattern = rule.pattern;
            if (pattern !== undefined) {
                if (!pattern.test(data)) {
                    this.errors.push(`${path}: Value '${data}' does not match pattern '${pattern}'`);
                    return null;
                }
            } else {
                if (!this.patterns["not_empty"].test(data)) {
                    this.errors.push(`${path}: Value '${data}' does not match pattern '${this.patterns['not_empty']}'`);
                    return null;
                }
            }
        }

        let cleanedData = data;

        if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
            cleanedData = {};
            const schemaKeys = rule.schema || {};
            
            for (const [key, value] of Object.entries(data)) {
                if (schemaKeys[key]) {
                    const cleanedVal = this._validateNode(value, schemaKeys[key], `${path}.${key}`);
                    if (cleanedVal !== null) {
                        cleanedData[key] = cleanedVal;
                    }
                } else if (rule.values_rule) {
                    const cleanedVal = this._validateNode(value, rule.values_rule, `${path}.${key}`);
                    if (cleanedVal !== null) {
                        cleanedData[key] = cleanedVal;
                    }
                } else {
                    if (Object.keys(schemaKeys).length > 0) {
                        this.warnings.push(`${path}: Unknown key '${key}'`);
                    }
                }
            }

            for (const [key, keyRule] of Object.entries(schemaKeys)) {
                const isRequired = keyRule.required !== undefined ? keyRule.required : true;
                if (isRequired && !(key in cleanedData)) {
                    this.errors.push(`${path}: Missing required key '${key}'`);
                }
            }
        } else if (Array.isArray(data)) {
            const itemRule = rule.item_rule;
            if (itemRule) {
                cleanedData = [];
                for (let i = 0; i < data.length; i++) {
                    const cleanedVal = this._validateNode(data[i], itemRule, `${path}[${i}]`);
                    if (cleanedVal !== null) {
                        cleanedData.push(cleanedVal);
                    }
                }
            } else {
                cleanedData = [...data];
            }
        }

        return cleanedData;
    }

    showValidationReport(reportPath, isValid, errors, warnings) {
        console.log("==================================================");
        console.log(" Validation Report");
        console.log("==================================================\n");
        console.log(`Validation report for: ${reportPath}\n`);

        if (isValid) {
            console.log("Hardware report is valid!");
        } else {
            console.log("Hardware report is not valid! Please check the errors and warnings below.");
        }

        if (errors && errors.length > 0) {
            console.log(`\n\x1b[31mErrors (${errors.length}):\x1b[0m`);
            errors.forEach((error, i) => {
                console.log(` ${i + 1}. ${error}`);
            });
        }

        if (warnings && warnings.length > 0) {
            console.log(`\n\x1b[33mWarnings (${warnings.length}):\x1b[0m`);
            warnings.forEach((warning, i) => {
                console.log(` ${i + 1}. ${warning}`);
            });
        }
    }
}

module.exports = { ReportValidator };
