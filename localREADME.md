
1. 远端设置

- 保留上游为 origin（默认就是）。
- 已添加你的 fork：myfork = https://github.com/ajason/langfuse.git。

2. 更新本地主分支，保持跟上游同步

git checkout main
git pull origin main

3. 开新分支开发

git checkout -b feature/xxx
# 开发、变更
git add ...
git commit -m "chore|feat|fix: ..."
git push -u myfork feature/xxx

之后继续开发时直接 git push（已绑定 up，到 myfork）。

4. 同步上游更新到你的分支

- 先更新本地 main：git checkout main && git pull origin main
- 在功能分支上变基或合并：
    - 推荐：git checkout feature/xxx && git rebase origin/main
    - 或合并：git merge origin/main
- 如 rebase 后需更新远端：git push --force-with-lease（不要用 --force）。

5. 你的 fork 的 main 也要跟上游保持同步

- 拉取上游本地：git checkout main && git pull origin main
- 推到 fork：git push myfork main
  或在 GitHub fork 页面用 “Sync fork”。

6. Docker 运行
    继续在当前仓库用 docker compose up 即可，不必重新克隆。端口/数据目录配置已在当前仓库生效。

要忽略的本地数据

- data/postgres 等本地数据目录一般不要提交，确认 .gitignore 已覆盖。