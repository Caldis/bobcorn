// React
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
// React Dropzone
import Dropzone from 'react-dropzone';
// antd
import { message, Modal } from 'antd';
const confirm = Modal.confirm;
// Components
import IconBlock from '../IconBlock';
import IconToolbar from '../IconToolbar';
// Utils
import { cn } from '../../lib/utils';
// Database
import db from '../../database';
// Config
import config, { defOption, setOption, getOption } from '../../config';
// Utils
import { throttleMustRun } from '../../utils/tools';
// Images
import noIconHintSad from '../../resources/imgs/nodata/noIconHint-sad.png';
import noIconHintHappy from '../../resources/imgs/nodata/noIconHint-happy.png';
// Store
import useAppStore from '../../store';

interface IconGridLocalProps {
  selectedGroup: string;
  handleIconSelected: (id: string | null, data?: any) => void;
  selectedIcon: string | null;
}

interface IconItem {
  id: string;
  iconName: string;
  iconCode: string;
  iconContent: string;
  [key: string]: any;
}

interface GroupItem {
  id: string;
  groupName: string;
  [key: string]: any;
}

// ── content-visibility wrapper for lazy rendering ───────────────────
const CHUNK_SIZE = 60; // icons per chunk for content-visibility batching

const IconChunk = React.memo(function IconChunk({
  icons,
  selectedIcon,
  iconBlockWidth,
  nameVisible,
  codeVisible,
  handleIconSelected,
}: {
  icons: IconItem[];
  selectedIcon: string | null;
  iconBlockWidth: number | string;
  nameVisible: boolean;
  codeVisible: boolean;
  handleIconSelected: (id: string | null, data?: any) => void;
}) {
  // 图标外框宽度 = 内容宽 + padding(16) + border(4)
  const colWidth = (typeof iconBlockWidth === 'number' ? iconBlockWidth : 100) + 20;

  return (
    <div
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: 'auto 200px',
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, ${colWidth}px)`,
        justifyContent: 'center',
        gap: '4px',
      }}
    >
      {icons.map((icon) => (
        <IconBlock
          key={icon.id}
          selected={icon.id === selectedIcon}
          data={icon}
          name={icon.iconName}
          code={icon.iconCode}
          content={icon.iconContent}
          width={iconBlockWidth}
          nameVisible={nameVisible}
          codeVisible={codeVisible}
          handleIconSelected={handleIconSelected}
        />
      ))}
    </div>
  );
});

function IconGridLocal({ selectedGroup, handleIconSelected, selectedIcon }: IconGridLocalProps) {
  const syncLeft = useAppStore((state: any) => state.syncLeft);
  const selectGroup = useAppStore((state: any) => state.selectGroup);

  const [iconData, setIconData] = useState<Record<string, IconItem[]>>({});
  const [iconBlockWrapperMaxWidth, setIconBlockWrapperMaxWidth] = useState<string>('100%');
  const [iconBlockWrapperOpacity, setIconBlockWrapperOpacity] = useState<number>(0);
  const [iconBlockWidth, setIconBlockWidth] = useState<number | string>(getOption().iconBlockSize);
  const [iconBlockNameVisible, setIconBlockNameVisible] = useState<boolean>(
    getOption().iconBlockNameVisible
  );
  const [iconBlockCodeVisible, setIconBlockCodeVisible] = useState<boolean>(
    getOption().iconBlockCodeVisible
  );
  const [searchKeyword, setSearchKeyword] = useState<string | null>(null);

  const widthTmpRef = useRef<number | null>(null);
  const prevSelectedGroupRef = useRef<string>(selectedGroup);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync icon data
  const sync = useCallback(
    (group?: string) => {
      const targetGroup = group || selectedGroup;
      if (targetGroup === 'resource-all') {
        const groupIconData: Record<string, IconItem[]> = {};
        db.getGroupList().forEach(
          (g: GroupItem) => (groupIconData[g.id] = db.getIconListFromGroup(g.id))
        );
        groupIconData['resource-uncategorized'] = db
          .getIconListFromGroup('resource-uncategorized')
          .concat(db.getIconListFromGroup('null'));
        setIconData(groupIconData);
      } else if (targetGroup === 'resource-recent') {
        const groupIconData: Record<string, IconItem[]> = {};
        groupIconData['resource-recent'] = db.getRecentlyUpdatedIcons(50);
        setIconData(groupIconData);
      } else if (targetGroup === 'resource-uncategorized') {
        const groupIconData: Record<string, IconItem[]> = {};
        groupIconData['resource-uncategorized'] = db
          .getIconListFromGroup('resource-uncategorized')
          .concat(db.getIconListFromGroup('null'));
        setIconData(groupIconData);
      } else {
        setIconData((prev) => ({
          ...prev,
          [targetGroup]: db.getIconListFromGroup(targetGroup),
        }));
      }
    },
    [selectedGroup]
  );

  useEffect(() => {
    // Initial sync
    sync();
    // 进入后延迟一点, 设置一下位置和透明度
    setTimeout(() => {
      setIconBlockWrapperOpacity(1);
    }, 500);
  }, []);

  // Subscribe to store changes to trigger re-sync (replaces SyncCenterLocal event)
  const groupData = useAppStore((state: any) => state.groupData);
  useEffect(() => {
    sync();
  }, [groupData]);

  useEffect(() => {
    if (selectedGroup !== prevSelectedGroupRef.current) {
      prevSelectedGroupRef.current = selectedGroup;
      sync(selectedGroup);
      deselectIcon();
    }
  }, [selectedGroup]);

  // Toolbar相关
  const updateNameVisible = useCallback((visible: boolean) => {
    setIconBlockNameVisible(visible);
    setOption({ iconBlockNameVisible: visible });
  }, []);
  const updateCodeVisible = useCallback((visible: boolean) => {
    setIconBlockCodeVisible(visible);
    setOption({ iconBlockCodeVisible: visible });
  }, []);

  // 更新搜索字符串 — throttle 300ms (输入过程中也能看到中间结果)
  const searchLastFireRef = useRef<number>(0);
  const updateSearchKeyword = useCallback((value: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const now = Date.now();
    const elapsed = now - searchLastFireRef.current;
    if (elapsed >= 300) {
      searchLastFireRef.current = now;
      setSearchKeyword(value || null);
    } else {
      searchTimerRef.current = setTimeout(() => {
        searchLastFireRef.current = Date.now();
        setSearchKeyword(value || null);
      }, 300 - elapsed);
    }
  }, []);

  // Icon容器宽度 — debounce 避免拖拽时频繁重渲染
  const widthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateIconWrapperWidth = useCallback((width: number) => {
    if (width) widthTmpRef.current = width;
    if (widthTimerRef.current) clearTimeout(widthTimerRef.current);
    widthTimerRef.current = setTimeout(() => {
      const iconWidth = width || widthTmpRef.current || defOption.iconBlockSize;
      setIconBlockWrapperMaxWidth('100%');
      setIconBlockWidth(iconWidth || 'auto');
      setIconBlockWrapperOpacity(1);
      setOption({ iconBlockSize: width });
    }, 150);
  }, []);

  // 拖放事件相关
  const onIconDrop = useCallback(
    (acceptedFiles: File[]) => {
      const acceptableIcons = acceptedFiles.filter((file) => {
        return config.acceptableIconTypes.includes(file.type);
      });
      if (acceptedFiles.length === 1) {
        const ext = acceptedFiles[0].name.split('.').pop()?.toLowerCase();
        if (ext === 'icp' || ext === 'cp') {
          // TODO: 接受项目文件
        }
        if (acceptableIcons.length > 0) {
          db.addIcons(acceptableIcons, selectedGroup, () => {
            message.success(`已成功导入 ${acceptableIcons.length} 个图标`);
            syncLeft();
            sync();
          });
        } else {
          message.error(`图标格式不相符, 仅支持导入 SVG 格式图标`);
        }
      } else {
        if (acceptableIcons.length !== acceptedFiles.length) {
          confirm({
            title: '发现了准备导入的图标中存在不相容的格式',
            content:
              '所选的图片中包含了非 SVG 格式的图标, 是否仅导入所选文件中的 SVG 格式图标? 非 SVG 格式的文件将不会被导入。',
            okText: '仅导入相容的文件',
            onOk() {
              db.addIcons(acceptableIcons, selectedGroup, () => {
                message.success(
                  `已导入了 ${acceptedFiles.length} 个图标中的 ${acceptableIcons.length} 个`
                );
                syncLeft();
                sync();
              });
            },
            onCancel() {
              message.warning(`导入已取消`);
            },
          });
        } else {
          db.addIcons(acceptableIcons, selectedGroup, () => {
            message.success(`已成功导入 ${acceptableIcons.length} 个图标`);
            syncLeft();
            sync();
          });
        }
      }
    },
    [selectedGroup, syncLeft, sync]
  );

  // 取消选择图标
  const deselectIcon = useCallback(() => {
    handleIconSelected(null);
  }, [handleIconSelected]);

  // ── 搜索过滤（预编译 regex + memoize 结果）──────────────────────
  const filteredIcons = useMemo(() => {
    const icons = iconData[selectedGroup];
    if (!icons) return [];
    if (!searchKeyword) return icons;

    try {
      const re = new RegExp(searchKeyword, 'ig');
      return icons.filter(
        (icon) =>
          re.test(icon.iconName) ||
          ((re.lastIndex = 0), re.test(icon.iconCode)) ||
          ((re.lastIndex = 0), false)
      );
    } catch {
      // Invalid regex — fallback to includes
      const kw = searchKeyword.toLowerCase();
      return icons.filter(
        (icon) =>
          icon.iconName.toLowerCase().includes(kw) || icon.iconCode.toLowerCase().includes(kw)
      );
    }
  }, [iconData, selectedGroup, searchKeyword]);

  // ── 分块渲染 — 将图标列表切分为 CHUNK_SIZE 的块 ────────────────
  const iconChunks = useMemo(() => {
    const chunks: IconItem[][] = [];
    for (let i = 0; i < filteredIcons.length; i += CHUNK_SIZE) {
      chunks.push(filteredIcons.slice(i, i + CHUNK_SIZE));
    }
    return chunks;
  }, [filteredIcons]);

  // ── "全部" 视图：按分组显示 ─────────────────────────────────────
  const allGroupChunks = useMemo(() => {
    if (selectedGroup !== 'resource-all') return null;

    const groups: { group: GroupItem; chunks: IconItem[][] }[] = [];
    const uncatIcons = iconData['resource-uncategorized'] || [];
    if (uncatIcons.length > 0) {
      const chunks: IconItem[][] = [];
      const filtered = searchKeyword
        ? uncatIcons.filter((icon) => {
            const kw = searchKeyword.toLowerCase();
            return (
              icon.iconName.toLowerCase().includes(kw) || icon.iconCode.toLowerCase().includes(kw)
            );
          })
        : uncatIcons;
      for (let i = 0; i < filtered.length; i += CHUNK_SIZE) {
        chunks.push(filtered.slice(i, i + CHUNK_SIZE));
      }
      if (filtered.length > 0) {
        groups.push({ group: { id: 'resource-uncategorized', groupName: '未分组' }, chunks });
      }
    }

    db.getGroupList().forEach((g: GroupItem) => {
      const gIcons = iconData[g.id] || [];
      if (gIcons.length === 0) return;
      const filtered = searchKeyword
        ? gIcons.filter((icon) => {
            const kw = searchKeyword.toLowerCase();
            return (
              icon.iconName.toLowerCase().includes(kw) || icon.iconCode.toLowerCase().includes(kw)
            );
          })
        : gIcons;
      if (filtered.length === 0) return;
      const chunks: IconItem[][] = [];
      for (let i = 0; i < filtered.length; i += CHUNK_SIZE) {
        chunks.push(filtered.slice(i, i + CHUNK_SIZE));
      }
      groups.push({ group: g, chunks });
    });

    return groups;
  }, [iconData, selectedGroup, searchKeyword]);

  // ── 渲染一般图标网格 ──────────────────────────────────────────
  const gridContent = useMemo(() => {
    if (selectedGroup === 'resource-all') {
      if (!allGroupChunks || allGroupChunks.length === 0) return null;
      return allGroupChunks.map(({ group, chunks }) => (
        <div key={group.id}>
          <div
            className={cn(
              'relative z-[1] cursor-pointer text-left',
              'w-full h-[30px] mt-2.5',
              'transition-colors duration-300',
              'bg-surface-muted dark:bg-surface-muted',
              'hover:bg-brand-50 dark:hover:bg-brand-950/40',
              'active:bg-brand-100 dark:active:bg-brand-900/40'
            )}
            onClick={() => selectGroup(group.id)}
          >
            <span className="leading-[30px] ml-[18px] text-brand-500 dark:text-brand-400">
              {group.groupName}
            </span>
            <label
              className={cn(
                'ml-2 px-1 py-0.5',
                'bg-brand-500 dark:bg-brand-600',
                'rounded text-white text-xs'
              )}
            >
              {chunks.reduce((sum, c) => sum + c.length, 0)}
            </label>
          </div>
          {chunks.map((chunk, ci) => (
            <IconChunk
              key={`${group.id}-${ci}`}
              icons={chunk}
              selectedIcon={selectedIcon}
              iconBlockWidth={iconBlockWidth}
              nameVisible={iconBlockNameVisible}
              codeVisible={iconBlockCodeVisible}
              handleIconSelected={handleIconSelected}
            />
          ))}
        </div>
      ));
    }

    // 普通分组 / 最近更新 / 未分组 etc.
    if (iconChunks.length === 0) return null;
    return iconChunks.map((chunk, ci) => (
      <IconChunk
        key={ci}
        icons={chunk}
        selectedIcon={selectedIcon}
        iconBlockWidth={iconBlockWidth}
        nameVisible={iconBlockNameVisible}
        codeVisible={iconBlockCodeVisible}
        handleIconSelected={handleIconSelected}
      />
    ));
  }, [
    selectedGroup,
    allGroupChunks,
    iconChunks,
    selectedIcon,
    iconBlockWidth,
    iconBlockNameVisible,
    iconBlockCodeVisible,
    handleIconSelected,
    deselectIcon,
    selectGroup,
  ]);

  const geneNodataBlock = () => {
    if (selectedGroup === 'resource-all') {
      return (
        <div
          className={cn(
            'absolute inset-0 w-full h-[calc(100vh-116px)]',
            'flex flex-col justify-center items-center text-center'
          )}
        >
          <img className="w-[150px]" src={noIconHintSad} />
          <div>
            <p className="text-foreground-muted dark:text-foreground-muted mb-2">还没有图标</p>
            <p className="text-foreground-muted dark:text-foreground-muted mb-2">
              直接拖拽图标到此处可添加图标
            </p>
          </div>
        </div>
      );
    } else if (selectedGroup === 'resource-uncategorized') {
      return (
        <div
          className={cn(
            'absolute inset-0 w-full h-[calc(100vh-116px)]',
            'flex flex-col justify-center items-center text-center'
          )}
        >
          <img className="w-[150px]" src={noIconHintHappy} />
          <div>
            <p className="text-foreground-muted dark:text-foreground-muted mb-2">
              图标都已经妥善分类了
            </p>
            <p className="text-foreground-muted dark:text-foreground-muted mb-2">
              当新加入的图标未分类时, 将出现在此处
            </p>
          </div>
        </div>
      );
    } else if (selectedGroup === 'resource-recent') {
      return (
        <div
          className={cn(
            'absolute inset-0 w-full h-[calc(100vh-116px)]',
            'flex flex-col justify-center items-center text-center'
          )}
        >
          <img className="w-[150px]" src={noIconHintSad} />
          <div>
            <p className="text-foreground-muted dark:text-foreground-muted mb-2">
              还没有更新过的图标
            </p>
          </div>
        </div>
      );
    } else if (selectedGroup === 'resource-recycleBin') {
      return (
        <div
          className={cn(
            'absolute inset-0 w-full h-[calc(100vh-116px)]',
            'flex flex-col justify-center items-center text-center'
          )}
        >
          <img className="w-[150px]" src={noIconHintHappy} />
          <div>
            <p className="text-foreground-muted dark:text-foreground-muted mb-2">回收站很干净</p>
            <p className="text-foreground-muted dark:text-foreground-muted mb-2">
              当图标被回收后, 将会出现在此处
            </p>
          </div>
        </div>
      );
    } else {
      return (
        <div
          className={cn(
            'absolute inset-0 w-full h-[calc(100vh-116px)]',
            'flex flex-col justify-center items-center text-center'
          )}
        >
          <img className="w-[150px]" src={noIconHintSad} />
          <div>
            <p className="text-foreground-muted dark:text-foreground-muted mb-2">
              这个分组没有图标
            </p>
          </div>
        </div>
      );
    }
  };

  const hasIcons =
    selectedGroup === 'resource-all'
      ? db.getIconCount() !== 0
      : iconData[selectedGroup] && iconData[selectedGroup].length !== 0;

  return (
    <div className="relative w-full h-full flex flex-col" id="iconGridLocalContainer">
      <Dropzone noClick onDrop={onIconDrop}>
        {({ getRootProps, getInputProps, isDragActive }) => (
          <div
            {...getRootProps({
              className: cn(
                'relative text-center flex-grow',
                'overflow-hidden overflow-y-auto',
                'transition-[filter] duration-300',
                isDragActive && 'blur-[30px]'
              ),
            })}
          >
            <input {...getInputProps()} />
            <div className="absolute inset-0 opacity-0 z-0" onClick={deselectIcon} />
            <div
              className="relative w-full"
              style={{
                width: '100%',
                maxWidth: iconBlockWrapperMaxWidth,
                opacity: iconBlockWrapperOpacity,
              }}
            >
              {hasIcons ? gridContent || geneNodataBlock() : geneNodataBlock()}
            </div>
          </div>
        )}
      </Dropzone>
      <div
        className={cn(
          'opacity-0 absolute inset-x-0 top-0',
          'w-[calc(100%-40px)] h-[calc(100%-80px)]',
          'm-5',
          'border border-dashed border-foreground/30 dark:border-foreground/30',
          'bg-foreground/10 dark:bg-foreground/10',
          'rounded-lg',
          'transition-opacity duration-700',
          'pointer-events-none',
          '[.blur-\\[30px\\]~&]:opacity-100'
        )}
      >
        <div className="w-full h-full flex justify-center items-center">
          <div className="font-bold text-base text-foreground dark:text-foreground">
            拖拽到此处将图标添加到该分组
          </div>
        </div>
      </div>
      <div className="z-10">
        <IconToolbar
          defaultIconWidth={getOption().iconBlockSize}
          updateIconWidth={updateIconWrapperWidth}
          defaultNameVisible={getOption().iconBlockNameVisible}
          updateNameVisible={updateNameVisible}
          defaultCodeVisible={getOption().iconBlockCodeVisible}
          updateCodeVisible={updateCodeVisible}
          updateSearchKeyword={updateSearchKeyword}
        />
      </div>
    </div>
  );
}

export default IconGridLocal;
