<script lang="ts">
  import VirtualizedList from '@/components/base/VirtualizedList.svelte'
  import { useListItemHeight } from '@/modules/app/reactive.svelte'
  import { playInfo, playList } from '@/modules/player/reactive.svelte'
  import ListItem from './ListItem.svelte'
  import Empty from '@/components/material/Empty.svelte'
  import { playerState } from '@/modules/player/store/state'
  import { musicClick } from './shared'
  import Menu from '@/components/common/MusicList/List/Menu.svelte'
  import { type ComponentExports, tick } from 'svelte'
  import { playIndex } from '@/modules/player/actions'

  let listItemHeight = useListItemHeight(3.2)
  let picstyle = $derived(`height:${listItemHeight.val * 0.8}px; width:${listItemHeight.val * 0.8}px;`)
  let menu = $state<ComponentExports<typeof Menu> | null>(null)
  // 右键菜单的 source 跟随被右键的歌曲（队列中可能混有多来源歌曲）
  let menuSource = $state<AnyListen.Player.SourceType>('kg')
</script>

<div class="container">
  {#if $playList.length}
    <VirtualizedList
      list={$playList}
      initialscrollindex={playerState.playInfo.index}
      initialscrollindexoffset={-100}
      keyname="itemId"
      containerclass="list"
      itemheight={listItemHeight.val}
      contain="content"
      scrollbaroffset="0"
    >
      {#snippet row(item, index)}
        <ListItem
          info={item}
          {picstyle}
          {index}
          playing={$playInfo.index == index}
          onclick={(isKey) => {
            // 单击无操作、双击直接播放（无需选中）
            musicClick(index)
            if (isKey) musicClick(index)
          }}
          oncontextmenu={async (event) => {
            event.preventDefault()
            event.stopPropagation()
            menuSource = item.source
            await tick()
            menu!.show(
              {
                listId: item.listId,
                musicInfo: item.musicInfo,
                selectedList: [],
                onRemoveAllSelected() {},
              },
              { x: event.pageX, y: event.pageY }
            )
          }}
        />
      {/snippet}
    </VirtualizedList>
    <Menu
      bind:this={menu}
      source={menuSource}
      type="default"
      deviceid={null}
      onplay={async (musicInfo) => {
        const index = $playList.findIndex((m) => m.musicInfo.id == musicInfo.id)
        if (index >= 0) await playIndex(index)
      }}
      onhide={() => {}}
      oncancelmulti={() => {}}
    />
  {:else}
    <Empty />
  {/if}
</div>

<style lang="less">
  .container {
    display: flex;
    flex: auto;
    flex-direction: column;
    min-height: 0;
    max-height: 100%;
    overflow: hidden;
  }
</style>
