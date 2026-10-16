<script lang="ts">
  import Checkbox from '@/components/base/Checkbox.svelte'
  import { t } from '@/plugins/i18n'
  let {
    multimode,
    picwidth,
    selectall,
    onselectall,
    disabledselect,
  }: {
    multimode: boolean
    selectall: boolean
    picwidth: number
    disabledselect?: boolean
    onselectall: (all: boolean) => void
  } = $props()
  // console.log(params)
</script>

<div class="header">
  <div class="num" style={`width:${picwidth}px;`}>
    {#if multimode}
      <Checkbox
        arialabel={$t('select_all')}
        checked={selectall}
        id="music_list_select_all_checkbox"
        disabled={disabledselect}
        onchange={() => {
          onselectall(!selectall)
        }}
      />
    {:else}
      #
    {/if}
  </div>
  <span style="flex: auto;">{$t('music_name')}</span>
  <span class="cell-singer" style="width: 22%;">{$t('music_singer')}</span>
  <span class="cell-album" style="width: 22%;">{$t('music_album')}</span>
  <span class="cell-time" style="width: 9%;">{$t('music_time')}</span>
</div>

<style lang="less">
  .header {
    display: flex;
    flex: none;
    flex-flow: row nowrap;
    gap: 10px;
    align-items: center;
    height: 36px;
    padding: 0 12px;
    // border-bottom: 1px solid var(--color-border);
    font-size: 12px;
    color: var(--color-font-label);

    :global(.checkbox) {
      font-size: 14px;
    }

    // 窄屏隐藏歌手和专辑列，避免横向滚动
    @media (max-width: @breakpoint-mobile) {
      .cell-singer,
      .cell-album {
        display: none;
      }
    }
  }
  .num {
    .nobreak();
    .center();

    display: flex;
    align-items: center;
    justify-content: center;
    // color: var(--color-font-label);
  }
</style>
