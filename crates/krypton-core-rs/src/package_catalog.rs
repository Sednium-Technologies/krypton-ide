use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct PackageItem {
    pub id: String,
    pub name: String,
    pub package_name: String,
    pub category: String,
    pub binary: String,
    pub description: String,
    pub install_command: String,
    pub uninstall_command: String,
    pub size_mb: u32,
}

pub struct PackageCatalog;

impl PackageCatalog {
    pub fn get_all_packages() -> Vec<PackageItem> {
        vec![
            PackageItem {
                id: "python3".to_string(),
                name: "Python 3 & pip".to_string(),
                package_name: "python".to_string(),
                category: "Toolchains".to_string(),
                binary: "python3".to_string(),
                description: "CPython 3 runtime, standard library, and pip package manager".to_string(),
                install_command: "pkg install -y python".to_string(),
                uninstall_command: "pkg uninstall -y python".to_string(),
                size_mb: 85,
            },
            PackageItem {
                id: "rust".to_string(),
                name: "Rust & Cargo".to_string(),
                package_name: "rust".to_string(),
                category: "Toolchains".to_string(),
                binary: "rustc".to_string(),
                description: "Rust compiler, Cargo package manager, and stdlib crates".to_string(),
                install_command: "pkg install -y rust".to_string(),
                uninstall_command: "pkg uninstall -y rust".to_string(),
                size_mb: 140,
            },
            PackageItem {
                id: "nodejs".to_string(),
                name: "Node.js & npm".to_string(),
                package_name: "nodejs".to_string(),
                category: "Toolchains".to_string(),
                binary: "node".to_string(),
                description: "V8 JavaScript runtime engine, npm CLI, and global modules".to_string(),
                install_command: "pkg install -y nodejs".to_string(),
                uninstall_command: "pkg uninstall -y nodejs".to_string(),
                size_mb: 65,
            },
            PackageItem {
                id: "clang".to_string(),
                name: "C/C++ Clang & LLVM".to_string(),
                package_name: "clang".to_string(),
                category: "Toolchains".to_string(),
                binary: "clang".to_string(),
                description: "LLVM Clang C/C++ compiler toolchain, lld linker, and libc++".to_string(),
                install_command: "pkg install -y clang".to_string(),
                uninstall_command: "pkg uninstall -y clang".to_string(),
                size_mb: 180,
            },
            PackageItem {
                id: "golang".to_string(),
                name: "Go Programming Language".to_string(),
                package_name: "golang".to_string(),
                category: "Toolchains".to_string(),
                binary: "go".to_string(),
                description: "Go compiler, runtime tools, and standard module cache".to_string(),
                install_command: "pkg install -y golang".to_string(),
                uninstall_command: "pkg uninstall -y golang".to_string(),
                size_mb: 110,
            },
            PackageItem {
                id: "git".to_string(),
                name: "Git VCS".to_string(),
                package_name: "git".to_string(),
                category: "Version Control".to_string(),
                binary: "git".to_string(),
                description: "Fast distributed version control system with SSH and HTTP support".to_string(),
                install_command: "pkg install -y git".to_string(),
                uninstall_command: "pkg uninstall -y git".to_string(),
                size_mb: 30,
            },
            PackageItem {
                id: "make".to_string(),
                name: "GNU Make".to_string(),
                package_name: "make".to_string(),
                category: "Build Tools".to_string(),
                binary: "make".to_string(),
                description: "Build automation utility for compiling projects from Makefiles".to_string(),
                install_command: "pkg install -y make".to_string(),
                uninstall_command: "pkg uninstall -y make".to_string(),
                size_mb: 5,
            },
            PackageItem {
                id: "ripgrep".to_string(),
                name: "Ripgrep (rg)".to_string(),
                package_name: "ripgrep".to_string(),
                category: "CLI Utilities".to_string(),
                binary: "rg".to_string(),
                description: "Line-oriented ultra-fast regex search tool respecting .gitignore".to_string(),
                install_command: "pkg install -y ripgrep".to_string(),
                uninstall_command: "pkg uninstall -y ripgrep".to_string(),
                size_mb: 8,
            },
            PackageItem {
                id: "curl".to_string(),
                name: "cURL & libcurl".to_string(),
                package_name: "curl".to_string(),
                category: "CLI Utilities".to_string(),
                binary: "curl".to_string(),
                description: "Command line tool for transferring data with URLs and HTTP/HTTPS".to_string(),
                install_command: "pkg install -y curl".to_string(),
                uninstall_command: "pkg uninstall -y curl".to_string(),
                size_mb: 4,
            },
            PackageItem {
                id: "zsh".to_string(),
                name: "Zsh Shell".to_string(),
                package_name: "zsh".to_string(),
                category: "CLI Utilities".to_string(),
                binary: "zsh".to_string(),
                description: "Advanced interactive shell designed for interactive command line work".to_string(),
                install_command: "pkg install -y zsh".to_string(),
                uninstall_command: "pkg uninstall -y zsh".to_string(),
                size_mb: 12,
            },
            PackageItem {
                id: "vim".to_string(),
                name: "Vim Editor".to_string(),
                package_name: "vim".to_string(),
                category: "Editors".to_string(),
                binary: "vim".to_string(),
                description: "Highly configurable text editor for efficient terminal-based editing".to_string(),
                install_command: "pkg install -y vim".to_string(),
                uninstall_command: "pkg uninstall -y vim".to_string(),
                size_mb: 18,
            },
            PackageItem {
                id: "htop".to_string(),
                name: "Htop Process Viewer".to_string(),
                package_name: "htop".to_string(),
                category: "CLI Utilities".to_string(),
                binary: "htop".to_string(),
                description: "Interactive process viewer and system hardware monitor".to_string(),
                install_command: "pkg install -y htop".to_string(),
                uninstall_command: "pkg uninstall -y htop".to_string(),
                size_mb: 3,
            },
            PackageItem {
                id: "tmux".to_string(),
                name: "Tmux Terminal Multiplexer".to_string(),
                package_name: "tmux".to_string(),
                category: "CLI Utilities".to_string(),
                binary: "tmux".to_string(),
                description: "Terminal multiplexer enabling multiple terminal sessions in one screen".to_string(),
                install_command: "pkg install -y tmux".to_string(),
                uninstall_command: "pkg uninstall -y tmux".to_string(),
                size_mb: 4,
            },
            PackageItem {
                id: "jq".to_string(),
                name: "jq JSON Processor".to_string(),
                package_name: "jq".to_string(),
                category: "CLI Utilities".to_string(),
                binary: "jq".to_string(),
                description: "Lightweight and flexible command-line JSON processor".to_string(),
                install_command: "pkg install -y jq".to_string(),
                uninstall_command: "pkg uninstall -y jq".to_string(),
                size_mb: 2,
            },
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_package_catalog_completeness() {
        let pkgs = PackageCatalog::get_all_packages();
        assert!(pkgs.len() >= 12);
        assert!(pkgs.iter().any(|p| p.binary == "python3"));
        assert!(pkgs.iter().any(|p| p.binary == "rustc"));
        assert!(pkgs.iter().any(|p| p.binary == "node"));
        assert!(pkgs.iter().any(|p| p.binary == "clang"));
        assert!(pkgs.iter().any(|p| p.binary == "rg"));
        assert!(pkgs.iter().any(|p| p.binary == "git"));
    }
}
