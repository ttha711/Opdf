import { useState, useEffect, useRef, useCallback } from "react";
import type { OpdfTab } from "../lib/web-storage";

interface TabBarProps {
  tabs: OpdfTab[];
  activeTabId: string | null;
  activeGroupFilter: string | null;
  switchTab: (id: string) => void;
  closeTab: (id: string) => void;
  addTabToGroup: (tabId: string, groupName: string, color?: string) => void;
  removeTabFromGroup: (tabId: string) => void;
  renameTabGroup: (oldName: string, newName: string) => void;
  changeTabGroupColor: (groupName: string, color: string) => void;
  closeTabGroup: (groupName: string) => void;
  ungroupGroup: (groupName: string) => void;
  openFile: () => void;
  showItemInFolder?: (filePath: string) => void;
}

export function TabBar({
  tabs,
  activeTabId,
  activeGroupFilter,
  switchTab,
  closeTab,
  addTabToGroup,
  removeTabFromGroup,
  renameTabGroup,
  changeTabGroupColor,
  closeTabGroup,
  ungroupGroup,
  openFile,
  showItemInFolder,
}: TabBarProps) {
  // UI states for floating menus
  const [activeMenuTabId, setActiveMenuTabId] = useState<string | null>(null);
  const [activeMenuGroupName, setActiveMenuGroupName] = useState<string | null>(null);
  const [menuCoords, setMenuCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showGroupColorPicker, setShowGroupColorPicker] = useState(false);

  const tabMenuRef = useRef<HTMLDivElement>(null);
  const groupMenuRef = useRef<HTMLDivElement>(null);

  // Group colors list
  const GROUP_COLORS = [
    { name: "Coral", value: "#ff5a5f" },
    { name: "Red", value: "#e03e2d" },
    { name: "Green", value: "#10b981" },
    { name: "Blue", value: "#0061d5" },
    { name: "Purple", value: "#8b5cf6" },
    { name: "Orange", value: "#f59e0b" },
  ];

  // Filter tabs by active group if a group filter parameter is present in URL
  const visibleTabs = tabs.filter(t => {
    if (activeGroupFilter) {
      return t.group === activeGroupFilter;
    }
    return true;
  });

  // Extract unique group names among currently loaded tabs
  const existingGroups = Array.from(
    new Set(tabs.map(t => t.group).filter((g): g is string => Boolean(g)))
  );

  // Close menus on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        activeMenuTabId &&
        tabMenuRef.current &&
        !tabMenuRef.current.contains(event.target as Node)
      ) {
        setActiveMenuTabId(null);
      }
      if (
        activeMenuGroupName &&
        groupMenuRef.current &&
        !groupMenuRef.current.contains(event.target as Node)
      ) {
        setActiveMenuGroupName(null);
        setShowGroupColorPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeMenuTabId, activeMenuGroupName]);

  // Handle right-click on tab
  const handleTabContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setActiveMenuTabId(tabId);
    setActiveMenuGroupName(null);
    setMenuCoords({ x: e.clientX, y: e.clientY });
  };

  // Handle click on group badge
  const handleGroupBadgeClick = (e: React.MouseEvent, groupName: string) => {
    e.stopPropagation();
    setActiveMenuGroupName(groupName);
    setActiveMenuTabId(null);
    setMenuCoords({ x: e.clientX, y: e.clientY + 12 });
  };

  const handleOpenGroupInNewWindow = (groupName: string) => {
    const origin = window.location.origin;
    window.open(`${origin}?group=${encodeURIComponent(groupName)}`, "_blank");
    setActiveMenuTabId(null);
    setActiveMenuGroupName(null);
  };

  const handleCreateNewGroup = (tabId: string) => {
    const name = prompt("Nhập tên nhóm tab mới (Enter new tab group name):");
    if (name && name.trim()) {
      addTabToGroup(tabId, name.trim());
    }
    setActiveMenuTabId(null);
  };

  const handleRenameGroupPrompt = (groupName: string) => {
    const newName = prompt(`Đổi tên nhóm "${groupName}" thành:`, groupName);
    if (newName && newName.trim() && newName.trim() !== groupName) {
      renameTabGroup(groupName, newName.trim());
    }
    setActiveMenuGroupName(null);
  };

  // Group tabs into clusters for beautiful visual representation
  // We keep tabs in their original order, but grouped ones display a boundary line.
  // In our render, we group tabs by their groups if they belong to one, or just show them in list
  // Chrome-like tab grouping:
  // Render groups dynamically
  
  return (
    <div className="tab-bar-container border-b border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-2 py-1 select-none relative flex items-center justify-between min-h-[38px]">
      
      {/* LEFT: Tabs & Group Badges Row */}
      <div className="flex items-center flex-wrap gap-1.5 flex-1 min-w-0 mr-4">
        
        {/* If filtered by URL group parameter, display a premium back pill */}
        {activeGroupFilter && (
          <div className="flex items-center gap-1 bg-[var(--ui-accent-bg)] border border-[var(--acrobat-blue)] rounded-full px-3 py-1 text-xs text-[var(--acrobat-blue)] font-bold animate-pulse">
            <span>Cửa sổ Nhóm: {activeGroupFilter}</span>
            <button 
              className="ml-1 cursor-pointer hover:bg-[var(--border-color)] rounded-full p-0.5"
              onClick={() => { window.location.search = ""; }}
              title="Hiện tất cả các tab (Show all tabs)"
            >
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
          {visibleTabs.map((tab, index) => {
            const isActive = tab.id === activeTabId;
            const isGrouped = Boolean(tab.group);
            
            // Check if this is the start of a new group cluster to show a group label
            const showGroupBadge = isGrouped && (index === 0 || visibleTabs[index - 1].group !== tab.group);
            
            return (
              <div key={tab.id} className="flex items-center gap-1">
                {showGroupBadge && tab.group && (
                  <span
                    className="tab-group-badge rounded-md px-2 py-1 text-[10px] font-bold uppercase cursor-pointer hover:scale-105 transition-all text-white"
                    style={{ backgroundColor: tab.groupColor || "#5e5e5e" }}
                    onClick={(e) => handleGroupBadgeClick(e, tab.group!)}
                    title={`Quản lý nhóm ${tab.group} (Click to manage group)`}
                  >
                    {tab.group}
                  </span>
                )}
                
                <div
                  className={`tab-item group relative flex items-center gap-2 rounded-t-md px-3 py-1.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                    isActive
                      ? "bg-[var(--bg-toolbar)] text-[var(--text-primary)] border-b-[var(--acrobat-blue)] shadow-sm"
                      : "text-[var(--text-secondary)] border-b-transparent hover:bg-[var(--ui-hover-bg)]"
                  }`}
                  style={{
                    borderTop: isGrouped ? `2px solid ${tab.groupColor}` : "none",
                  }}
                  onClick={() => switchTab(tab.id)}
                  onContextMenu={(e) => handleTabContextMenu(e, tab.id)}
                  title={tab.fileName}
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="#e03e2d" className="flex-shrink-0">
                    <path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6z" />
                  </svg>
                  
                  <span className="max-w-[120px] truncate whitespace-nowrap">
                    {tab.fileName.split(/[/\\]/).pop() || tab.fileName}
                  </span>

                  <button
                    className="flex h-4.5 w-4.5 items-center justify-center rounded-full p-0.5 text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 hover:bg-[var(--ui-subtle-hover)] hover:text-black transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    title="Đóng tab (Close tab)"
                    type="button"
                  >
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* PLUS BUTTON: Add tab */}
        <button
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-[var(--bg-toolbar)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--acrobat-blue)] hover:text-[var(--acrobat-blue)] transition-colors shadow-sm"
          onClick={openFile}
          title="Mở file mới vào Tab mới (Open file in a new Tab)"
          type="button"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {/* RIGHT: Quick stats */}
      <div className="flex-shrink-0 hidden md:flex items-center gap-2 text-[11px] text-[var(--text-secondary)] font-medium">
        <span>Tổng cộng: {tabs.length} tab</span>
      </div>

      {/* CUSTOM CONTEXT MENU: Tab Options */}
      {activeMenuTabId && (
        <div
          ref={tabMenuRef}
          className="fixed z-50 min-w-[190px] rounded-lg border border-[var(--border-color)] bg-[var(--bg-toolbar)] p-1.5 shadow-xl text-[var(--text-primary)]"
          style={{ top: menuCoords.y, left: menuCoords.x }}
        >
          {/* Group Options Submenu */}
          <div className="px-2 py-1 text-[11px] font-bold text-[var(--text-secondary)] border-b border-[var(--ui-divider)]">
            Nhóm Tab (Tab Groups)
          </div>
          <button
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-[var(--ui-hover-bg)] rounded-md cursor-pointer"
            onClick={() => handleCreateNewGroup(activeMenuTabId)}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Tạo nhóm mới...
          </button>
          
          {existingGroups.length > 0 && (
            <div className="border-t border-[var(--ui-divider)] my-1">
              <div className="px-2.5 py-0.5 text-[9px] font-bold text-[var(--text-secondary)]">Thêm vào nhóm:</div>
              {existingGroups.map(group => (
                <button
                  key={group}
                  className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-[var(--ui-hover-bg)] rounded-md cursor-pointer"
                  onClick={() => {
                    addTabToGroup(activeMenuTabId, group);
                    setActiveMenuTabId(null);
                  }}
                >
                  <span className="truncate">{group}</span>
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: tabs.find(t => t.group === group)?.groupColor || "#888",
                    }}
                  />
                </button>
              ))}
            </div>
          )}

          {tabs.find(t => t.id === activeMenuTabId)?.group && (
            <button
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-[var(--ui-hover-bg)] text-red-500 rounded-md cursor-pointer border-t border-[var(--ui-divider)]"
              onClick={() => {
                removeTabFromGroup(activeMenuTabId);
                setActiveMenuTabId(null);
              }}
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
              Xóa khỏi nhóm
            </button>
          )}

          <div className="border-t border-[var(--ui-divider)] my-1" />

          {/* Open Group in New Window Option */}
          {tabs.find(t => t.id === activeMenuTabId)?.group && (
            <button
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-[var(--ui-hover-bg)] rounded-md cursor-pointer"
              onClick={() => {
                const tab = tabs.find(t => t.id === activeMenuTabId);
                if (tab?.group) handleOpenGroupInNewWindow(tab.group);
              }}
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
              </svg>
              Mở nhóm sang cửa sổ mới
            </button>
          )}

          {(() => {
            const tab = tabs.find(t => t.id === activeMenuTabId);
            if (!tab?.fileName) return null;
            const baseName = tab.fileName.split(/[/\\]/).pop() || tab.fileName;
            const isFullPath = tab.fileName !== baseName;
            return (
              <>
                <div className="border-t border-[var(--ui-divider)] my-1" />
                {isFullPath && (
                  <div className="px-2.5 py-1 text-[10px] text-[var(--text-secondary)] break-all leading-tight select-text">
                    {tab.fileName}
                  </div>
                )}
                <button
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-[var(--ui-hover-bg)] rounded-md cursor-pointer"
                  onClick={() => {
                    void navigator.clipboard.writeText(tab.fileName);
                    setActiveMenuTabId(null);
                  }}
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  {isFullPath ? "Sao chép đường dẫn" : "Sao chép tên file"}
                </button>
                {showItemInFolder && (
                  <button
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-[var(--ui-hover-bg)] rounded-md cursor-pointer"
                    onClick={() => {
                      showItemInFolder(tab.fileName);
                      setActiveMenuTabId(null);
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                    </svg>
                    Mở thư mục chứa file
                  </button>
                )}
              </>
            );
          })()}

          <button
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-[var(--ui-hover-bg)] text-[var(--ui-danger)] rounded-md cursor-pointer border-t border-[var(--ui-divider)]"
            onClick={() => {
              closeTab(activeMenuTabId);
              setActiveMenuTabId(null);
            }}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Đóng Tab
          </button>
        </div>
      )}

      {/* CUSTOM FLOATING MENU: Group Management */}
      {activeMenuGroupName && (
        <div
          ref={groupMenuRef}
          className="fixed z-50 min-w-[200px] rounded-lg border border-[var(--border-color)] bg-[var(--bg-toolbar)] p-1.5 shadow-xl text-[var(--text-primary)] animate-scaleIn"
          style={{ top: menuCoords.y, left: menuCoords.x }}
        >
          <div className="px-2 py-1 text-[11px] font-bold text-[var(--text-secondary)] border-b border-[var(--ui-divider)] flex justify-between items-center">
            <span>Nhóm: {activeMenuGroupName}</span>
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: tabs.find(t => t.group === activeMenuGroupName)?.groupColor || "#888",
              }}
            />
          </div>

          <button
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-[var(--ui-hover-bg)] rounded-md cursor-pointer"
            onClick={() => handleOpenGroupInNewWindow(activeMenuGroupName)}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
            </svg>
            Mở nhóm sang cửa sổ mới
          </button>

          <button
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-[var(--ui-hover-bg)] rounded-md cursor-pointer"
            onClick={() => handleRenameGroupPrompt(activeMenuGroupName)}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Đổi tên nhóm (Rename)...
          </button>

          {/* Change Color Swatches Option */}
          <button
            className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-[var(--ui-hover-bg)] rounded-md cursor-pointer"
            onClick={() => setShowGroupColorPicker(!showGroupColorPicker)}
          >
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a7 7 0 0 0-7 7c0 4.14 7 13 7 13s7-8.86 7-13a7 7 0 0 0-7-7z" />
              </svg>
              Đổi màu nhóm
            </div>
            <span>{showGroupColorPicker ? "▼" : "▶"}</span>
          </button>

          {showGroupColorPicker && (
            <div className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-[var(--ui-muted-bg)] border border-[var(--border-color)] rounded-md my-1 animate-fadeIn">
              {GROUP_COLORS.map(color => (
                <button
                  key={color.name}
                  className="h-4.5 w-4.5 rounded-full border border-gray-600 hover:scale-125 transition-transform cursor-pointer"
                  style={{ backgroundColor: color.value }}
                  onClick={() => {
                    changeTabGroupColor(activeMenuGroupName, color.value);
                    setShowGroupColorPicker(false);
                    setActiveMenuGroupName(null);
                  }}
                  title={color.name}
                />
              ))}
            </div>
          )}

          <button
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-[var(--ui-hover-bg)] text-red-500 rounded-md cursor-pointer border-t border-[var(--ui-divider)]"
            onClick={() => {
              if (activeMenuGroupName) {
                ungroupGroup(activeMenuGroupName);
              }
              setActiveMenuGroupName(null);
            }}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            Rã nhóm (Ungroup)
          </button>

          <button
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-[var(--ui-hover-bg)] text-[var(--ui-danger)] rounded-md cursor-pointer border-t border-[var(--ui-divider)]"
            onClick={() => {
              closeTabGroup(activeMenuGroupName);
              setActiveMenuGroupName(null);
            }}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Đóng toàn bộ nhóm
          </button>
        </div>
      )}
    </div>
  );
}
