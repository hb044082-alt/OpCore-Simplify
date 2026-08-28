#!/usr/bin/env node
"use strict";

/**
 * OpCore-Simplify.js
 *
 * Node.js port of the Python OCPE entry-point class from OpCore Simplify.
 *
 * NOTE: This file assumes the same module layout as the Python project,
 * translated to CommonJS. Each of the following is expected to exist as
 * its own .js module exporting an equivalent API to its Python counterpart:
 *
 *   ./Scripts/datasets/os_data.js
 *   ./Scripts/datasets/chipset_data.js
 *   ./Scripts/acpi_guru.js
 *   ./Scripts/compatibility_checker.js
 *   ./Scripts/config_prodigy.js
 *   ./Scripts/gathering_files.js
 *   ./Scripts/hardware_customizer.js
 *   ./Scripts/kext_maestro.js
 *   ./Scripts/report_validator.js
 *   ./Scripts/run.js
 *   ./Scripts/smbios.js
 *   ./Scripts/utils.js
 *   ./updater.js
 *
 * This file only re-implements OCPE itself (main.py). The submodules are
 * not included here since they weren't part of the provided source.
 */

const path = require("path");
const fs = require("fs");
const readlineSync = require("readline-sync");

const os_data = require("./Scripts/datasets/os_data");
const chipset_data = require("./Scripts/datasets/chipset_data");
const acpi_guru = require("./Scripts/acpi_guru");
const compatibility_checker = require("./Scripts/compatibility_checker");
const config_prodigy = require("./Scripts/config_prodigy");
const gathering_files = require("./Scripts/gathering_files");
const hardware_customizer = require("./Scripts/hardware_customizer");
const kext_maestro = require("./Scripts/kext_maestro");
const report_validator = require("./Scripts/report_validator");
const run = require("./Scripts/run");
const smbios = require("./Scripts/smbios");
const utils = require("./Scripts/utils");
const updater = require("./updater");

// --- small helpers to mirror Python built-ins used in the script ---

// Synchronous sleep (Node has no blocking sleep by default).
function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4);
  const view = new Int32Array(sab);
  Atomics.wait(view, 0, 0, ms);
}

// dict.get(key, default) equivalent that only falls back on undefined,
// matching Python's "missing key" semantics (not falsy-value semantics).
function dget(obj, key, def) {
  if (obj == null) return def;
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : def;
}

class OCPE {
  constructor() {
    this.u = new utils.Utils("OpCore Simplify");
    this.u.clean_temporary_dir();
    this.ac = new acpi_guru.ACPIGuru();
    this.c = new compatibility_checker.CompatibilityChecker();
    this.co = new config_prodigy.ConfigProdigy();
    this.o = new gathering_files.gatheringFiles();
    this.h = new hardware_customizer.HardwareCustomizer();
    this.k = new kext_maestro.KextMaestro();
    this.s = new smbios.SMBIOS();
    this.v = new report_validator.ReportValidator();
    this.r = new run.Run();
    this.result_dir = path.join(__dirname, "Results");
  }

  select_hardware_report() {
    this.ac.dsdt = null;
    this.ac.acpi.acpi_tables = null;

    while (true) {
      this.u.head("Select hardware report");
      console.log("");
      if (process.platform === "win32") {
        console.log("\x1b[1;93mNote:\x1b[0m");
        console.log(
          "- Ensure you are using the latest version of Hardware Sniffer before generating the hardware report."
        );
        console.log(
          "- Hardware Sniffer will not collect information related to Resizable BAR option of GPU (disabled by default) and monitor connections in Windows PE."
        );
        console.log("");
      }
      console.log("E. Export hardware report (Recommended)");
      console.log("");
      console.log("Q. Quit");
      console.log("");

      const prompt =
        "Drag and drop your hardware report here (.JSON)" +
        (process.platform === "win32" ? ' or type "E" to export' : "") +
        ": ";
      const user_input = this.u.request_input(prompt);

      if (user_input.toLowerCase() === "q") {
        this.u.exit_program();
      }

      if (user_input.toLowerCase() === "e") {
        const hardware_sniffer = this.o.gather_hardware_sniffer();
        if (!hardware_sniffer) {
          continue;
        }

        const report_dir = path.join(__dirname, "SysReport");
        this.u.head("Exporting Hardware Report");
        console.log("");
        console.log(`Exporting hardware report to ${report_dir}...`);

        const output = this.r.run({
          args: [hardware_sniffer, "-e", "-o", report_dir],
        });

        const exitCode = output[output.length - 1];
        if (exitCode !== 0) {
          let error_message;
          switch (exitCode) {
            case 3:
              error_message = "Error collecting hardware.";
              break;
            case 4:
              error_message = "Error generating hardware report.";
              break;
            case 5:
              error_message = "Error dumping ACPI tables.";
              break;
            default:
              error_message = "Unknown error.";
          }
          console.log("");
          console.log(`Could not export the hardware report. ${error_message}`);
          console.log("Please try again or using Hardware Sniffer manually.");
          console.log("");
          this.u.request_input();
          continue;
        } else {
          const report_path = path.join(report_dir, "Report.json");
          const acpitables_dir = path.join(report_dir, "ACPI");
          const report_data = this.u.read_file(report_path);
          this.ac.read_acpi_tables(acpitables_dir);
          return [report_path, report_data];
        }
      }

      const normalized = this.u.normalize_path(user_input);
      const [is_valid, errors, warnings, data] = this.v.validate_report(normalized);
      this.v.show_validation_report(normalized, is_valid, errors, warnings);

      if (!is_valid || (errors && errors.length)) {
        console.log("");
        console.log("\x1b[32mSuggestion:\x1b[0m Please re-export the hardware report and try again.");
        console.log("");
        this.u.request_input("Press Enter to go back...");
      } else {
        return [normalized, data];
      }
    }
  }

  show_oclp_warning(macos_version) {
    const is_tahoe =
      this.u.parse_darwin_version(macos_version) >= this.u.parse_darwin_version("25.0.0");

    while (true) {
      this.u.head("OpenCore Legacy Patcher Warning");
      console.log("");
      console.log("\x1b[1;96mWhy it is required:\x1b[0m");
      console.log("- Restores compatibility for GPUs and Broadcom WiFi.");
      if (is_tahoe) {
        console.log("- Rolls back AppleHDA to restore audio support through AppleALC.");
      }
      console.log("");
      console.log("\x1b[1;93mRisks and limitations:\x1b[0m");
      console.log("- Disables macOS security features, including SIP and AMFI.");
      console.log(
        "- macOS updates require full installers, apps may crash or the system may become unstable."
      );
      console.log("- OpenCore Legacy Patcher does not officially support Hackintosh systems.");
      console.log("");
      console.log("\x1b[1;91mReview these risks before continuing.\x1b[0m");
      console.log("");

      const option = this.u
        .request_input("Continue with OpenCore Legacy Patcher? (yes/No): ")
        .trim()
        .toLowerCase();

      if (option === "yes") return true;
      if (option === "no") return false;
    }
  }

  select_macos_version(hardware_report, native_macos_version, ocl_patched_macos_version) {
    let suggested_macos_version = native_macos_version[1];
    const version_pattern = /^(\d+)(?:\.(\d+)(?:\.(\d+))?)?$/;

    for (const device_type of ["GPU", "Network", "Bluetooth", "SD Controller"]) {
      if (Object.prototype.hasOwnProperty.call(hardware_report, device_type)) {
        const devices = hardware_report[device_type];
        for (const device_name of Object.keys(devices)) {
          const device_props = devices[device_name];
          const compat = dget(device_props, "Compatibility", [null, null]);
          if (!(compat[0] === null && compat[1] === null)) {
            if (device_type === "GPU" && device_props["Device Type"] === "Integrated GPU") {
              const device_id = dget(device_props, "Device ID", "").slice(5);
              if (
                device_props["Manufacturer"] === "AMD" ||
                device_id.startsWith("59") ||
                device_id.startsWith("87C0")
              ) {
                suggested_macos_version = "22.99.99";
              } else if (device_id.startsWith("09") || device_id.startsWith("19")) {
                suggested_macos_version = "21.99.99";
              }
            }
            if (
              this.u.parse_darwin_version(suggested_macos_version) >
              this.u.parse_darwin_version(compat[0])
            ) {
              suggested_macos_version = compat[0];
            }
          }
        }
      }
    }

    while (true) {
      if (os_data.get_macos_name_by_darwin(suggested_macos_version).includes("Beta")) {
        suggested_macos_version =
          String(parseInt(suggested_macos_version.slice(0, 2), 10) - 1) +
          suggested_macos_version.slice(2);
      } else {
        break;
      }
    }

    while (true) {
      this.u.head("Select macOS Version");
      if (native_macos_version[1].slice(0, 2) !== suggested_macos_version.slice(0, 2)) {
        console.log("");
        console.log("\x1b[1;36mSuggested macOS version:\x1b[0m");
        console.log(
          `- For better compatibility and stability, we suggest you to use only ${os_data.get_macos_name_by_darwin(
            suggested_macos_version
          )} or older.`
        );
      }
      console.log("");
      console.log("Available macOS versions:");
      console.log("");

      const oclp_min = ocl_patched_macos_version
        ? parseInt(ocl_patched_macos_version[ocl_patched_macos_version.length - 1].slice(0, 2), 10)
        : 99;
      const oclp_max = ocl_patched_macos_version
        ? parseInt(ocl_patched_macos_version[0].slice(0, 2), 10)
        : 0;
      const min_version = Math.min(parseInt(native_macos_version[0].slice(0, 2), 10), oclp_min);
      const max_version = Math.max(
        parseInt(native_macos_version[native_macos_version.length - 1].slice(0, 2), 10),
        oclp_max
      );

      for (let darwin_version = min_version; darwin_version <= max_version; darwin_version++) {
        const name = os_data.get_macos_name_by_darwin(String(darwin_version));
        const label =
          darwin_version >= oclp_min && darwin_version <= oclp_max
            ? " (\x1b[1;93mRequires OpenCore Legacy Patcher\x1b[0m)"
            : "";
        console.log(`  ${darwin_version}. ${name}${label}`);
      }

      console.log("");
      console.log("\x1b[1;93mNote:\x1b[0m");
      console.log("- To select a major version, enter the number (e.g., 19).");
      console.log("- To specify a full version, use the Darwin version format (e.g., 22.4.6).");
      console.log("");
      console.log("Q. Quit");
      console.log("");

      const raw_option = this.u.request_input(
        `Please enter the macOS version you want to use (default: ${os_data.get_macos_name_by_darwin(
          suggested_macos_version
        )}): `
      );
      const option = raw_option || suggested_macos_version;

      if (option.toLowerCase() === "q") {
        this.u.exit_program();
      }

      const match = version_pattern.exec(option);
      if (match) {
        const target_version = `${match[1]}.${match[2] ? match[2] : 99}.${
          match[3] ? match[3] : 99
        }`;

        if (
          ocl_patched_macos_version &&
          this.u.parse_darwin_version(
            ocl_patched_macos_version[ocl_patched_macos_version.length - 1]
          ) <= this.u.parse_darwin_version(target_version) &&
          this.u.parse_darwin_version(target_version) <=
            this.u.parse_darwin_version(ocl_patched_macos_version[0])
        ) {
          return target_version;
        } else if (
          this.u.parse_darwin_version(native_macos_version[0]) <=
            this.u.parse_darwin_version(target_version) &&
          this.u.parse_darwin_version(target_version) <=
            this.u.parse_darwin_version(native_macos_version[native_macos_version.length - 1])
        ) {
          return target_version;
        }
      }
    }
  }

  build_opencore_efi(hardware_report, disabled_devices, smbios_model, macos_version, needs_oclp) {
    const steps = [
      "Copying EFI base to results folder",
      "Applying ACPI patches",
      "Copying kexts and snapshotting to config.plist",
      "Generating config.plist",
      "Cleaning up unused drivers, resources, and tools",
    ];
    const title = "Building OpenCore EFI";

    this.u.progress_bar(title, steps, 0);
    this.u.create_folder(this.result_dir, { remove_content: true });

    if (!fs.existsSync(this.k.ock_files_dir)) {
      throw new Error(`Directory '${this.k.ock_files_dir}' does not exist.`);
    }

    const source_efi_dir = path.join(this.k.ock_files_dir, "OpenCorePkg");
    this.u.copytree(source_efi_dir, this.result_dir, { dirs_exist_ok: true });

    const config_file = path.join(this.result_dir, "EFI", "OC", "config.plist");
    const config_data = this.u.read_file(config_file);
    if (!config_data) {
      throw new Error(`Error: The file ${config_file} does not exist.`);
    }
    this.u.progress_bar(title, steps, 1);

    config_data.ACPI.Add = [];
    config_data.ACPI.Delete = [];
    config_data.ACPI.Patch = [];

    if (this.ac.ensure_dsdt()) {
      this.ac.hardware_report = hardware_report;
      this.ac.disabled_devices = disabled_devices;
      this.ac.acpi_directory = path.join(this.result_dir, "EFI", "OC", "ACPI");
      this.ac.smbios_model = smbios_model;
      this.ac.lpc_bus_device = this.ac.get_lpc_name();

      for (const patch of this.ac.patches) {
        if (patch.checked) {
          if (patch.name === "BATP") {
            patch.checked = this.ac[patch.function_name]();
            this.k.kexts[
              kext_maestro.kext_data.kext_index_by_name["ECEnabler"]
            ].checked = patch.checked;
            continue;
          }
          const acpi_load = this.ac[patch.function_name]();
          if (typeof acpi_load !== "object" || acpi_load === null || Array.isArray(acpi_load)) {
            continue;
          }
          config_data.ACPI.Add.push(...dget(acpi_load, "Add", []));
          config_data.ACPI.Delete.push(...dget(acpi_load, "Delete", []));
          config_data.ACPI.Patch.push(...dget(acpi_load, "Patch", []));
        }
      }
      config_data.ACPI.Patch.push(...this.ac.dsdt_patches);
      config_data.ACPI.Patch = this.ac.apply_acpi_patches(config_data.ACPI.Patch);
    }
    this.u.progress_bar(title, steps, 2);

    const kexts_directory = path.join(this.result_dir, "EFI", "OC", "Kexts");
    this.k.install_kexts_to_efi(macos_version, kexts_directory);
    config_data.Kernel.Add = this.k.load_kexts(hardware_report, macos_version, kexts_directory);
    this.u.progress_bar(title, steps, 3);

    this.co.genarate(
      hardware_report,
      disabled_devices,
      smbios_model,
      macos_version,
      needs_oclp,
      this.k.kexts,
      config_data
    );
    this.u.write_file(config_file, config_data);
    this.u.progress_bar(title, steps, 4);

    const files_to_remove = [];

    const drivers_directory = path.join(this.result_dir, "EFI", "OC", "Drivers");
    const driver_list = this.u.find_matching_paths(drivers_directory, { extension_filter: ".efi" });
    const driver_loaded = (dget(config_data.UEFI, "Drivers", []) || []).map((k) => k.Path);
    for (const [driver_path] of driver_list) {
      if (!driver_loaded.includes(driver_path)) {
        files_to_remove.push(path.join(drivers_directory, driver_path));
      }
    }

    const resources_audio_dir = path.join(this.result_dir, "EFI", "OC", "Resources", "Audio");
    if (fs.existsSync(resources_audio_dir)) {
      files_to_remove.push(resources_audio_dir);
    }

    let picker_variant = dget(dget(config_data.Misc, "Boot", {}), "PickerVariant", undefined);
    if (picker_variant == null || picker_variant === "Auto") {
      picker_variant = "Acidanthera/GoldenGate";
    }
    if (process.platform === "win32") {
      picker_variant = picker_variant.split("/").join("\\");
    }

    const resources_image_dir = path.join(this.result_dir, "EFI", "OC", "Resources", "Image");
    const available_picker_variants = this.u.find_matching_paths(resources_image_dir, {
      type_filter: "dir",
    });
    for (const [variant_name] of available_picker_variants) {
      const variant_path = path.join(resources_image_dir, variant_name);
      const contents = fs.readdirSync(variant_path).join(", ");
      if (contents.includes(".icns")) {
        if (!variant_name.includes(picker_variant)) {
          files_to_remove.push(variant_path);
        }
      }
    }

    const tools_directory = path.join(this.result_dir, "EFI", "OC", "Tools");
    const tool_list = this.u.find_matching_paths(tools_directory, { extension_filter: ".efi" });
    const tool_loaded = (dget(config_data.Misc, "Tools", []) || []).map((t) => t.Path);
    for (const [tool_path] of tool_list) {
      if (!tool_loaded.includes(tool_path)) {
        files_to_remove.push(path.join(tools_directory, tool_path));
      }
    }

    if (fs.readdirSync(this.result_dir).includes("manifest.json")) {
      files_to_remove.push(path.join(this.result_dir, "manifest.json"));
    }

    for (const file_path of files_to_remove) {
      try {
        const stat = fs.lstatSync(file_path);
        if (stat.isDirectory()) {
          fs.rmSync(file_path, { recursive: true, force: true });
        } else {
          fs.unlinkSync(file_path);
        }
      } catch (e) {
        console.log(`Failed to remove file: ${e}`);
      }
    }

    this.u.progress_bar(title, steps, steps.length, { done: true });
    console.log("OpenCore EFI build complete.");
    sleepSync(2000);
  }

  check_bios_requirements(org_hardware_report, hardware_report) {
    const requirements = [];

    const org_firmware_type = dget(dget(org_hardware_report, "BIOS", {}), "Firmware Type", "Unknown");
    const firmware_type = dget(dget(hardware_report, "BIOS", {}), "Firmware Type", "Unknown");
    if (org_firmware_type === "Legacy" && firmware_type === "UEFI") {
      requirements.push("Enable UEFI mode (disable Legacy/CSM (Compatibility Support Module))");
    }

    const secure_boot = dget(dget(hardware_report, "BIOS", {}), "Secure Boot", "Unknown");
    if (secure_boot !== "Disabled") {
      requirements.push("Disable Secure Boot");
    }

    const motherboard = dget(hardware_report, "Motherboard", {});
    if (
      motherboard["Platform"] === "Desktop" &&
      chipset_data.IntelChipsets.slice(112).includes(motherboard["Chipset"])
    ) {
      const gpus = dget(hardware_report, "GPU", {});
      const resizable_bar_enabled = Object.values(gpus).some(
        (gpu_props) => dget(gpu_props, "Resizable BAR", "Disabled") === "Enabled"
      );
      if (!resizable_bar_enabled) {
        requirements.push("Enable Above 4G Decoding");
        requirements.push("Disable Resizable BAR/Smart Access Memory");
      }
    }

    return requirements;
  }

  before_using_efi(org_hardware_report, hardware_report) {
    this.u.head("Before Using EFI");
    console.log("");
    console.log("\x1b[93mPlease complete the following steps:\x1b[0m");
    console.log("");

    const bios_requirements = this.check_bios_requirements(org_hardware_report, hardware_report);
    if (bios_requirements.length) {
      console.log("* BIOS/UEFI Settings Required:");
      for (const requirement of bios_requirements) {
        console.log(`  - ${requirement}`);
      }
      console.log("");
    }

    const kextsPath = process.platform === "win32" ? "EFI\\OC\\Kexts" : "EFI/OC/Kexts";
    console.log("* USB Mapping:");
    console.log("  - Use USBToolBox tool to map USB ports.");
    console.log(`  - Add created UTBMap.kext into the ${kextsPath} folder.`);
    console.log(`  - Remove UTBDefault.kext in the ${kextsPath} folder.`);
    console.log("  - Edit config.plist:");
    console.log("    - Use ProperTree to open your config.plist.");
    console.log("    - Run OC Snapshot by pressing Command/Ctrl + R.");
    console.log("    - If you have more than 15 ports on a single controller, enable the XhciPortLimit patch.");
    console.log("    - Save the file when finished.");
    console.log("");

    this.u.request_input();
    this.u.open_folder(this.result_dir);
  }

  main() {
    let hardware_report_path = null;
    let hardware_report = null;
    let native_macos_version = null;
    let disabled_devices = null;
    let macos_version = null;
    let ocl_patched_macos_version = null;
    let needs_oclp = false;
    let smbios_model = null;
    let customized_hardware = null;

    while (true) {
      this.u.head();
      console.log("");
      console.log(`  Hardware Report: ${hardware_report_path || "Not selected"}`);

      if (hardware_report_path) {
        console.log("");
        const macos_label = macos_version
          ? os_data.get_macos_name_by_darwin(macos_version)
          : "Not selected";
        const macos_suffix = macos_version ? ` (${macos_version})` : "";
        const oclp_suffix = needs_oclp
          ? ". \x1b[1;93mRequires OpenCore Legacy Patcher\x1b[0m"
          : "";
        console.log(`  macOS Version: ${macos_label}${macos_suffix}${oclp_suffix}`);
        console.log(`  SMBIOS: ${smbios_model || "Not selected"}`);
        if (disabled_devices && Object.keys(disabled_devices).length) {
          console.log("  Disabled Devices:");
          for (const device of Object.keys(disabled_devices)) {
            console.log(`    - ${device}`);
          }
        }
      }

      console.log("");
      console.log("1. Select Hardware Report");
      console.log("2. Select macOS Version");
      console.log("3. Customize ACPI Patch");
      console.log("4. Customize Kexts");
      console.log("5. Customize SMBIOS Model");
      console.log("6. Build OpenCore EFI");
      console.log("");
      console.log("Q. Quit");
      console.log("");

      const option = this.u.request_input("Select an option: ");

      if (option.toLowerCase() === "q") {
        this.u.exit_program();
      }

      if (option === "1") {
        [hardware_report_path, hardware_report] = this.select_hardware_report();
        [hardware_report, native_macos_version, ocl_patched_macos_version] =
          this.c.check_compatibility(hardware_report);
        macos_version = this.select_macos_version(
          hardware_report,
          native_macos_version,
          ocl_patched_macos_version
        );
        [customized_hardware, disabled_devices, needs_oclp] = this.h.hardware_customization(
          hardware_report,
          macos_version
        );
        smbios_model = this.s.select_smbios_model(customized_hardware, macos_version);
        if (!this.ac.ensure_dsdt()) {
          this.ac.select_acpi_tables();
        }
        this.ac.select_acpi_patches(customized_hardware, disabled_devices);
        needs_oclp = this.k.select_required_kexts(
          customized_hardware,
          macos_version,
          needs_oclp,
          this.ac.patches
        );
        this.s.smbios_specific_options(
          customized_hardware,
          smbios_model,
          macos_version,
          this.ac.patches,
          this.k
        );
      }

      if (!hardware_report_path) {
        this.u.head();
        console.log("\n\n");
        console.log("\x1b[1;93mPlease select a hardware report first.\x1b[0m");
        console.log("\n\n");
        this.u.request_input("Press Enter to go back...");
        continue;
      }

      if (option === "2") {
        macos_version = this.select_macos_version(
          hardware_report,
          native_macos_version,
          ocl_patched_macos_version
        );
        [customized_hardware, disabled_devices, needs_oclp] = this.h.hardware_customization(
          hardware_report,
          macos_version
        );
        smbios_model = this.s.select_smbios_model(customized_hardware, macos_version);
        needs_oclp = this.k.select_required_kexts(
          customized_hardware,
          macos_version,
          needs_oclp,
          this.ac.patches
        );
        this.s.smbios_specific_options(
          customized_hardware,
          smbios_model,
          macos_version,
          this.ac.patches,
          this.k
        );
      } else if (option === "3") {
        this.ac.customize_patch_selection();
      } else if (option === "4") {
        this.k.kext_configuration_menu(macos_version);
      } else if (option === "5") {
        smbios_model = this.s.customize_smbios_model(customized_hardware, smbios_model, macos_version);
        this.s.smbios_specific_options(
          customized_hardware,
          smbios_model,
          macos_version,
          this.ac.patches,
          this.k
        );
      } else if (option === "6") {
        if (needs_oclp && !this.show_oclp_warning(macos_version)) {
          macos_version = this.select_macos_version(
            hardware_report,
            native_macos_version,
            ocl_patched_macos_version
          );
          [customized_hardware, disabled_devices, needs_oclp] = this.h.hardware_customization(
            hardware_report,
            macos_version
          );
          smbios_model = this.s.select_smbios_model(customized_hardware, macos_version);
          needs_oclp = this.k.select_required_kexts(
            customized_hardware,
            macos_version,
            needs_oclp,
            this.ac.patches
          );
          this.s.smbios_specific_options(
            customized_hardware,
            smbios_model,
            macos_version,
            this.ac.patches,
            this.k
          );
          continue;
        }

        try {
          this.o.gather_bootloader_kexts(this.k.kexts, macos_version);
        } catch (e) {
          console.log(`\x1b[91mError: ${e}\x1b[0m`);
          console.log("");
          this.u.request_input("Press Enter to continue...");
          continue;
        }

        this.build_opencore_efi(
          customized_hardware,
          disabled_devices,
          smbios_model,
          macos_version,
          needs_oclp
        );
        this.before_using_efi(hardware_report, customized_hardware);

        this.u.head("Result");
        console.log("");
        console.log(
          `Your OpenCore EFI for ${customized_hardware.Motherboard.Name} has been built at:`
        );
        console.log(`\t${this.result_dir}`);
        console.log("");
        this.u.request_input("Press Enter to main menu...");
      }
    }
  }
}

function main() {
  const update_flag = new updater.Updater().run_update();
  if (update_flag) {
    // Re-exec the process, mirroring os.execv(sys.executable, ...)
    const { spawnSync } = require("child_process");
    const result = spawnSync(process.execPath, process.argv.slice(1), { stdio: "inherit" });
    process.exit(result.status === null ? 1 : result.status);
  }

  const o = new OCPE();
  while (true) {
    try {
      o.main();
    } catch (e) {
      o.u.head("An Error Occurred");
      console.log("");
      console.log(e && e.stack ? e.stack : String(e));
      o.u.request_input();
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { OCPE };
