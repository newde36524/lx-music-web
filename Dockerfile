# 锁 digest 而不是锁 tag：tag 解析每次都要去 auth.docker.io / registry-1.docker.io 查最新，
# 这条链路在国内会被随机掐断（TLS handshake timeout / EOF）。digest 是不可变的，
# 命中本地缓存就不需要任何 registry 往返。要换版本时改这一行即可。
FROM alpine:3.23@sha256:ff7f0c727dd796aa36787bfcd9a64bf35a6ce72a73451b3359fde849b6703d63 AS base

# https://github.com/nodejs/docker-node/issues/1946

# RUN apk add --update --no-cache nodejs npm
# RUN node -e "console.log(123)"
# RUN npm i corepack -g

# https://github.com/nodejs/docker-node/blob/8d8fc479a7d5e98b71c944f362a76303c2ee18e5/22/alpine3.21/Dockerfile


# apk 源：dl-cdn.alpinelinux.org 在国内经常 TLS 握手失败，apk 会直接报 "no such package"。
# 下面的 RUN 都是先走官方源，失败后再切到镜像源重试；换镜像时传参覆盖即可：
#   docker build --build-arg ALPINE_MIRROR=https://mirrors.aliyun.com/alpine .
ARG ALPINE_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/alpine

FROM base AS builder

ARG IS_CI
ARG GIT_COMMIT_ID
ARG GIT_COMMIT_DATE

WORKDIR /source-code

# timeout 防止 apk 卡在下载上不报错；失败一次就换镜像源，最多试 3 次
RUN for attempt in 1 2 3; do \
      echo ">>> apk add (attempt $attempt)"; \
      timeout 180 apk add --update --no-cache \
        g++ \
        make \
        py3-pip \
        git \
        nodejs \
        icu-data-full \
        npm \
      && exit 0; \
      echo ">>> 超时/失败，切换 apk 源到 $ALPINE_MIRROR 重试"; \
      sed -i "s#https://dl-cdn.alpinelinux.org/alpine#${ALPINE_MIRROR}#" /etc/apk/repositories; \
    done; \
    echo ">>> apk add 3 次均失败" && exit 1

ENV PNPM_HOME="/pnpm"
ENV WEB_SERVER_ONLY="true"

# 仓库里没有 .npmrc，pnpm 默认走 registry.npmjs.org，国内基本拉不动
ENV NPM_CONFIG_REGISTRY="https://registry.npmmirror.com"

# corepack 读自己的 COREPACK_NPM_REGISTRY，不看 NPM_CONFIG_REGISTRY。它会从默认 npmjs
# 下载 pnpm 自身（https://registry.npmjs.org/pnpm/-/pnpm-x.y.z.tgz），这条链路拉不动。
# 不修这个的话 pnpm fetch 前面一步就一直失败。
ENV COREPACK_NPM_REGISTRY="https://registry.npmmirror.com"

# 网络能通但慢（实测单次请求 2.5~4s）。pnpm 默认 network-concurrency=16、
# fetch-retries=2、connect 超时很短，在这种链路上 16 个并发一撞重置就整批失败。
# 改成低并发 + 长超时 + 指数退避重试，比在外面整层重试靠谱得多。
ENV NPM_CONFIG_NETWORK_CONCURRENCY="4"
ENV NPM_CONFIG_FETCH_TIMEOUT="600000"
ENV NPM_CONFIG_FETCH_RETRIES="6"
ENV NPM_CONFIG_FETCH_RETRY_FACTOR="2"
ENV NPM_CONFIG_FETCH_RETRY_MINTIMEOUT="5000"
ENV NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT="120000"

# better-sqlite3 走 node-pre-gyp：先试 github 预编译包，失败退回 node-gyp 源码编译，
# 编译要从 nodejs.org 拉 Node headers。nodejs.org 从这里实测 2.5s/请求，node-gyp 默认
# 超时直接 ECONNRESET；npmmirror 的 Node 镜像实测 19~190ms。三个变量都设，覆盖
# node-gyp 新旧版本的读取方式。
ENV NODEJS_ORG_MIRROR="https://npmmirror.com/mirrors/node/"
ENV NPM_CONFIG_NODEJS_ORG_MIRROR="https://npmmirror.com/mirrors/node/"
ENV NPM_CONFIG_DISTURL="https://npmmirror.com/mirrors/node/"

ENV PATH="$PNPM_HOME:$PATH"
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# pnpm fetch 要拉 ~960 个包，中途 socket 中断（UND_ERR_SOCKET / ECONNRESET）会失败。
# store 是增量的，重试只补没下完的部分，所以和上面 apk 一样包一层重试。
# --ignore-scripts：fetch 本该只拉 tarball，实测它却会跑 better-sqlite3 的 install 脚本
# 去拉 Node headers 并因超时失败。native 编译交给下面的 pnpm pi，不在这一步做。
RUN npm install corepack -g && corepack enable pnpm && \
    for attempt in 1 2 3 4 5; do \
      echo ">>> pnpm fetch (attempt $attempt)"; \
      timeout 2400 pnpm fetch --ignore-scripts && exit 0; \
      echo ">>> pnpm fetch 失败，20s 后重试"; sleep 20; \
    done; \
    echo ">>> pnpm fetch 5 次均失败" && exit 1

COPY . ./
RUN pnpm i --offline --frozen-lockfile

# 编译 better-sqlite3 的 native 产物（build/Release/better_sqlite3.node）。
# WEB_SERVER_ONLY=true 只 rebuild web-server 的 native 依赖，跳过 desktop。
# 不跑这一步的话 copyAssets 复制 build/Release/better_sqlite3.node 会直接 ENOENT。
RUN pnpm pi

ENV IS_CI=${IS_CI}
ENV CI=${IS_CI}
ENV GIT_COMMIT_ID=${GIT_COMMIT_ID}
ENV GIT_COMMIT_DATE="${GIT_COMMIT_DATE}"

RUN pnpm build:web

FROM base AS final
WORKDIR /server

# https://github.com/sindresorhus/file-type/issues/664
# add icu-data-full fix `new TextDecoder('latin1')` error
#
# 故意拆成两层：原来一条 apk add 装完 nodejs + icu-data-full + tzdata 共 98MB，推送时
# 单次要传 ~25MB 压缩数据，在 TLS 会被随机掐断的链路上基本传不完（实测推送 40 次，
# 其他 5 层全成功，唯独这层 0 次）。拆开后每层 ~50MB / ~36MB，Docker Hub 支持按层续传，
# 传完的层不会重传。运行时功能不变，只是镜像多一层。
RUN for attempt in 1 2 3; do \
      echo ">>> apk add nodejs (attempt $attempt)"; \
      timeout 180 apk add --update --no-cache nodejs && exit 0; \
      echo ">>> 超时/失败，切换 apk 源到 $ALPINE_MIRROR 重试"; \
      sed -i "s#https://dl-cdn.alpinelinux.org/alpine#${ALPINE_MIRROR}#" /etc/apk/repositories; \
    done; \
    echo ">>> apk add nodejs 3 次均失败" && exit 1

RUN for attempt in 1 2 3; do \
      echo ">>> apk add icu-data-full tzdata (attempt $attempt)"; \
      timeout 180 apk add --update --no-cache icu-data-full tzdata && exit 0; \
      echo ">>> 超时/失败，切换 apk 源到 $ALPINE_MIRROR 重试"; \
      sed -i "s#https://dl-cdn.alpinelinux.org/alpine#${ALPINE_MIRROR}#" /etc/apk/repositories; \
    done; \
    echo ">>> apk add icu-data-full tzdata 3 次均失败" && exit 1

RUN addgroup -g 1001 -S algroup && adduser -u 1001 -S anylisten -G algroup
RUN mkdir /server/data && chown anylisten:algroup /server/data

COPY --from=builder --chown=anylisten:algroup ./source-code/build ./

ENV DATA_PATH="/server/data"

# https://en.wikipedia.org/wiki/List_of_tz_database_time_zones#List
# ENV TZ=Asia/Shanghai
ENV NODE_ENV="production"
ENV PORT="9500"
ENV BIND_IP="0.0.0.0"

EXPOSE 9500

USER anylisten

CMD [ "node", "index.cjs" ]
