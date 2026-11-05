<script lang="ts">
  import Image from '@/components/base/Image.svelte'
  import { musicInfo, playerPlaying } from '@/modules/player/reactive.svelte'
  import { onVisibilityChange } from '@any-listen/web'
  import { onMount } from 'svelte'

  // let { introend }: { introend: boolean } = $props()

  let pic = $derived($musicInfo.pic)
  let visible = $state(true)

  onMount(() => {
    return onVisibilityChange((hidden) => {
      visible = !hidden
    })
  })
</script>

<div class="cover">
  <span class="top-dot"></span>
  <span class="bottom-dot"></span>

  <svg class="cover-cd" class:playing={$playerPlaying && visible} viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <mask id="play-detail-cd-hole">
        <rect width="100" height="100" fill="white" />
        <circle cx="50" cy="50" r="11.6" fill="black" />
      </mask>
    </defs>

    <circle cx="50" cy="50" r="50" fill="#fff" mask="url(#play-detail-cd-hole)" />
    <foreignObject style="mix-blend-mode: multiply" x="2" y="2" width="96" height="96" mask="url(#play-detail-cd-hole)">
      <Image src={pic} />
    </foreignObject>
    <circle
      cx="50"
      cy="50"
      r="11.6"
      fill="none"
      stroke="rgb(0 0 0 / 30%)"
      stroke-width="0.4"
    />
  </svg>
</div>

<style lang="less">
  .cover {
    position: relative;
    flex: none;
    // 封面宽度：不超过内容宽度（--content-width），且在横屏/矮视口下按可用高度收缩
    // （100cqh = .left-info 内容高度；预留 ~100px 给封面下方的歌曲信息块），
    // 避免封面超过主区高度被裁剪、把信息块/进度条挤出视口（手机横屏问题）。
    width: min(var(--content-width), calc(100cqh - 100px));
    aspect-ratio: 1 / 1;
    // 去掉 padding：CD 封面填满整个方形容器，呈现完整正圆（需求：手机横屏 CD 放大、正圆）。
    padding: 0;
    contain: strict;
    // 沉浸式背景（模糊封面）上不再铺绿色容器：容器透明，CD 直接浮在背景上，
    // 与背景色调统一（需求：左边封面和背景不搭，去掉绿色框/光晕/角点）。
    background-color: transparent;
    border-radius: 6px;
    // 去掉绿色光晕（box-shadow）与容器模糊（backdrop-filter）
    // 保留轻微半透明，让 CD 更融入背景
    opacity: 0.8;

    // 隐藏绿色角点（原为绿色装饰，与暗色背景不搭）
    .top-dot,
    .bottom-dot {
      display: none;
    }
  }
  .cover-cd {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    // 去掉绿色光晕（需求：手机横屏去除 CD 外圈绿色圈）
    box-shadow: none;
    animation: spin 120s linear infinite;
    animation-play-state: paused; /* 默认暂停 */

    &.playing {
      animation-play-state: running;
    }

    :global(.pic) {
      border-radius: 50%;
      box-shadow: none;
    }
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
