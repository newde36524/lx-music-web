<script lang="ts">
  import Icons from '@/components/layout/Icons.svelte'
  import AppLayout from '@/components/layout/index.svelte'
  import Loading from '@/components/layout/Loading.svelte'
  import Login from '@/views/Login/index.svelte'
  import DownloadProgress from '@/modules/download/progress/App.svelte'
  import { useAppAeady, useShowLogin } from '@/modules/app/reactive.svelte'
  import { downloadProgressState } from '@/modules/download/progress/store.svelte'
  import { onMount } from 'svelte'

  const appReady = useAppAeady()
  const showLogin = useShowLogin()

  onMount(() => {
    document.getElementById('root')!.style.display = 'block'

    // 禁用边缘滑动前进后退和页面拖拽
    const EDGE_THRESHOLD = 20
    const preventSwipe = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (!touch) return
      const x = touch.clientX
      const y = touch.clientY
      const width = window.innerWidth
      const height = window.innerHeight
      // 从屏幕边缘开始滑动时阻止默认行为（禁用前进后退）
      if (x < EDGE_THRESHOLD || x > width - EDGE_THRESHOLD || y < EDGE_THRESHOLD || y > height - EDGE_THRESHOLD) {
        e.preventDefault()
      }
    }
    document.addEventListener('touchmove', preventSwipe, { passive: false })

    // 禁用移动端双击 / 双指缩放页面（iOS Safari 的 gesture 事件，配合 viewport 的 user-scalable=no）
    const preventGesture = (e: Event) => {
      e.preventDefault()
    }
    document.addEventListener('gesturestart', preventGesture, { passive: false })
    document.addEventListener('gesturechange', preventGesture, { passive: false })
    document.addEventListener('gestureend', preventGesture, { passive: false })

    // Android / 其它浏览器没有 iOS 的 gesture 事件，双指捏合缩放走 touch 事件。
    // 这里对「双指及以上」的 touchmove 阻止默认行为，从 JS 层面兜底禁用捏合缩放；
    // 单指滑动不拦截，不影响列表滚动与滑杆拖拽。
    const preventTouchZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault()
    }
    document.addEventListener('touchmove', preventTouchZoom, { passive: false })
  })
</script>

<div id="container" class="view-container">
  <Icons />
  {#if import.meta.env.VITE_IS_DESKTOP}
    {#if appReady.appAeady}
      <AppLayout />
    {/if}
  {/if}
  {#if import.meta.env.VITE_IS_WEB}
    {#if appReady.appAeady}
      <AppLayout />
    {:else}
      <Loading />
    {/if}
    {#if showLogin.showLogin}
      <Login />
    {/if}
  {/if}
  <DownloadProgress
    visible={downloadProgressState.visible}
    status={downloadProgressState.status}
    progress={downloadProgressState.progress}
    speed={downloadProgressState.speed}
    fileName={downloadProgressState.fileName}
    errorMessage={downloadProgressState.errorMessage}
    blobUrl={downloadProgressState.blobUrl}
  />
  <!-- <layout-view id="view" />
  <layout-play-bar id="player" />
  <layout-icons />
  <layout-change-log-modal />
  <layout-update-modal />
  <layout-pact-modal />
  <layout-sync-mode-modal />
  <layout-sync-auth-code-modal />
  <layout-play-detail /> -->
</div>
