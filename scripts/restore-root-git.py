#!/usr/bin/env python3
"""Restore the root checkout from .release-games without changing either worktree."""

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


REMOTES = {
    "https://github.com/wowayou/games.git",
    "https://github.com/wowayou/games",
    "git@github.com:wowayou/games.git",
}


def git(directory, *args):
    return subprocess.check_output(
        ["git", "--no-optional-locks", "-C", str(directory), *args],
        text=True,
        stderr=subprocess.PIPE,
    ).strip()


def restore(root, apply):
    for name in ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"):
        if name in os.environ:
            raise RuntimeError(f"请先取消环境变量 {name}，避免操作其他仓库。")

    target = root / ".git"
    if target.is_symlink() or (target.exists() and not target.is_dir()):
        raise RuntimeError("顶层 .git 已存在且不是普通目录；不会覆盖。")
    if target.exists() and any(target.iterdir()):
        if (git(root, "rev-parse", "--show-toplevel") == str(root)
                and git(root, "remote", "get-url", "origin") in REMOTES):
            print("顶层已关联 wowayou/games，无需重复迁移。")
            return
        raise RuntimeError("顶层 .git 非空；不会覆盖已有仓库。")

    source = root / ".release-games"
    metadata = source / ".git"
    if not metadata.is_dir() or metadata.is_symlink():
        raise RuntimeError("找不到 .release-games/.git 普通目录。")
    if git(source, "rev-parse", "--absolute-git-dir") != str(metadata):
        raise RuntimeError("发布副本使用外部 Git 元数据，不能直接迁移。")
    if git(source, "remote", "get-url", "origin") not in REMOTES:
        raise RuntimeError("发布副本的 origin 不是 wowayou/games。")
    if git(source, "status", "--porcelain", "--untracked-files=no"):
        raise RuntimeError("发布副本有已跟踪文件的改动；请先保留并处理，避免遗漏。")
    if len(git(source, "worktree", "list", "--porcelain").split("worktree ")) != 2:
        raise RuntimeError("发布副本有多个工作树，不能直接迁移。")
    if "core.worktree " in git(source, "config", "--local", "--get-regexp", "^core\\."):
        raise RuntimeError("发布副本设置了 core.worktree，不能直接迁移。")
    if (metadata / "objects/info/alternates").exists():
        raise RuntimeError("发布副本依赖外部 Git 对象，不能直接迁移。")
    if any(p.is_symlink() or p.name.endswith(".lock") for p in metadata.rglob("*")):
        raise RuntimeError("Git 元数据包含符号链接或锁文件；请先检查。")

    missing = [name for name in git(source, "ls-files", "-z").split("\0")
               if name and not (root / name).is_file()]
    if missing:
        raise RuntimeError("顶层缺少已跟踪文件：" + ", ".join(missing))
    if not (root / ".gitignore").is_file():
        raise RuntimeError("请先准备顶层 .gitignore，隔离各独立游戏仓库。")
    git(source, "fsck", "--full")

    print(f"来源：{source}")
    print(f"目标：{root}")
    print(f"提交：{git(source, 'rev-parse', 'HEAD')}")
    print("仅复制 Git 历史、分支、索引和远程配置；保留发布副本及所有工作文件。")
    if target.exists() and not os.access(target, os.W_OK):
        raise RuntimeError("顶层 .git 只读。请在可写的普通终端执行；脚本不会绕过权限。")
    if not apply:
        print("检查通过。加 --apply 执行；不会自动提交、推送或部署。")
        return

    # Copy completely before installing; never remove or overwrite a nonempty .git.
    with tempfile.TemporaryDirectory(prefix=".git-restore-", dir=root) as temporary:
        staged = Path(temporary) / ".git"
        shutil.copytree(metadata, staged)
        os.replace(staged, target)

    print("顶层关联已恢复。原 .release-games 保留为备份，后续从顶层开发。")
    print(git(root, "status", "--short", "--branch"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="执行迁移；默认只检查")
    args = parser.parse_args()
    try:
        restore(Path(__file__).resolve().parents[1], args.apply)
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        detail = error.stderr.strip() if isinstance(error, subprocess.CalledProcessError) else str(error)
        print(f"未完成：{detail}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
