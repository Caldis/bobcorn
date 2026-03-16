// React
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
// React Dropzone
import Dropzone from 'react-dropzone';
// UI
import { message, confirm } from '../ui';
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
  // When groupData changes in the store (after syncLeft), re-sync the center panel
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
  const updateNameVisible = (visible: boolean) => {
    setIconBlockNameVisible(visible);
    setOption({ iconBlockNameVisible: visible });
  };
  const updateCodeVisible = (visible: boolean) => {
    setIconBlockCodeVisible(visible);
    setOption({ iconBlockCodeVisible: visible });
  };

  // 更新搜索字符串
  const updateSearchKeyword = (value: string) => {
    setSearchKeyword(value);
  };

  // Icon容器宽度透明度相关
  const updateIconWrapperWidth = (width: number) => {
    if (width) widthTmpRef.current = width;
    const iconWidth = width || widthTmpRef.current || defOption.iconBlockSize;
    setIconBlockWrapperMaxWidth('100%');
    setIconBlockWidth(iconWidth || 'auto');
    setIconBlockWrapperOpacity(1);
    setOption({ iconBlockSize: width });
  };

  // 更新宽度节流
  const updateIconWidthThrottle = useMemo(
    () => throttleMustRun(updateIconWrapperWidth, 100, 300),
    []
  );

  // 拖放事件相关
  const onIconDrop = (acceptedFiles: File[]) => {
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
  };

  // 取消选择图标
  const deselectIcon = () => {
    handleIconSelected(null);
  };

  // 判断是否符合搜索结果
  const matchKeyword = (icon: IconItem) => {
    if (searchKeyword) {
      return (
        icon.iconName.match(new RegExp(searchKeyword, 'ig')) ||
        icon.iconCode.match(new RegExp(searchKeyword, 'ig'))
      );
    } else {
      return true;
    }
  };

  // 生成一般图标矩阵
  const geneIconGrid = () => {
    return iconData[selectedGroup].map(
      (icon: IconItem) =>
        matchKeyword(icon) && (
          <IconBlock
            key={icon.id}
            selected={icon.id === selectedIcon}
            data={icon}
            name={icon.iconName}
            code={icon.iconCode}
            content={icon.iconContent}
            width={iconBlockWidth}
            nameVisible={iconBlockNameVisible}
            codeVisible={iconBlockCodeVisible}
            handleIconSelected={handleIconSelected}
          />
        )
    );
  };

  // 生成图标矩阵组 (全部分类下使用, 带分组头)
  const geneIconGridWithGroup = () => {
    return [
      geneIconGroupGrid({
        id: 'resource-uncategorized',
        groupName: '未分组',
      }),
    ].concat(
      db.getGroupList().map((group: GroupItem) => {
        return geneIconGroupGrid(group);
      })
    );
  };

  // 生成图标矩阵 (用于全部分类, 带分组标题)
  const geneIconGroupGrid = (group: GroupItem) => {
    const groupIconData = iconData[group.id];
    if (groupIconData && groupIconData.length !== 0) {
      return (
        <div key={group.id}>
          <div className="absolute inset-0 opacity-0 z-0" onClick={deselectIcon} />
          <div
            className={cn(
              'relative z-[1] cursor-pointer',
              'w-full h-[30px] mt-2.5 mx-auto',
              'transition-all duration-300',
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
              {groupIconData.length}
            </label>
          </div>
          {groupIconData.map(
            (icon: IconItem) =>
              matchKeyword(icon) && (
                <IconBlock
                  key={icon.id}
                  selected={icon.id === selectedIcon}
                  data={icon}
                  name={icon.iconName}
                  code={icon.iconCode}
                  content={icon.iconContent}
                  width={iconBlockWidth}
                  nameVisible={iconBlockNameVisible}
                  codeVisible={iconBlockCodeVisible}
                  handleIconSelected={handleIconSelected}
                />
              )
          )}
        </div>
      );
    }
  };

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
              className={cn(
                'relative max-w-full inline-block text-left',
                'transition-all duration-300'
              )}
              style={{
                width: '100%',
                maxWidth: iconBlockWrapperMaxWidth,
                opacity: iconBlockWrapperOpacity,
              }}
            >
              {selectedGroup === 'resource-all'
                ? db.getIconCount() !== 0
                  ? geneIconGridWithGroup()
                  : geneNodataBlock()
                : iconData[selectedGroup] && iconData[selectedGroup].length !== 0
                  ? geneIconGrid()
                  : geneNodataBlock()}
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
          // Sibling combinator not available in Tailwind inline — use CSS peer pattern
          // The overlay visibility is controlled by the peer blur state
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
          updateIconWidth={updateIconWidthThrottle}
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
