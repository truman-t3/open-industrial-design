# Open Industrial Design Canvas Interaction Specification

---

# 1. Coordinate System

Canvas 使用世界坐标。

Viewport：

```ts
{
  (x, y, zoom);
}
```

Node domain 坐标：

```text
不随 viewport 变化
```

---

# 2. Pan

支持：

- Space + drag
- Middle mouse drag
- Hand tool

Pan 时：

- 不移动 Node
- cursor 明确变化

---

# 3. Zoom

支持：

- wheel / trackpad
- Ctrl/Cmd + wheel（按平台合理处理）
- zoom around pointer

建议范围：

```text
0.1x – 4x
```

不要让 zoom 到 NaN / 0。

---

# 4. Selection

点击空白：

```text
clear selection
```

Shift click：

```text
toggle node selection
```

Marquee：

```text
select intersecting or contained
```

必须全项目统一一种规则并测试。

---

# 5. Drag

拖动 Node：

- live update
- pointermove 不写 IndexedDB
- pointerup commit command
- autosave after debounce

---

# 6. Resize

Resize：

- maintain reasonable min size
- image aspect ratio 可通过 modifier lock
- multi-selection transform 必须谨慎

v0.1 如 multi-resize 复杂，可先只支持 group bounding transform，但行为必须一致。

---

# 7. Copy / Paste

复制 Node 时：

- 新 ID
- 保留 asset reference
- 如果是纯 Canvas copy，不复制 Asset Blob

复制 Design-bound Node：

默认：

```text
复制 visual representation
```

不要偷偷创建新 Design。

创建 Variant 必须用明确 action。

---

# 8. Duplicate

同 Copy/Paste。

默认偏移：

```text
+16px / +16px
```

---

# 9. Delete

删除 Node：

```text
删除 Canvas representation
```

不自动删除：

- Design
- Asset
- ViewSet
- CMF

若未来支持 domain delete，单独入口。

---

# 10. Group

Group 是 Canvas organization。

Group 不代表：

```text
Design hierarchy
```

---

# 11. Z-order

支持：

- bring forward
- send backward
- bring to front
- send to back（建议）

---

# 12. Connector

Connector 创建 Edge。

用户：

1. 选择 connector tool
2. source node
3. target node
4. 默认 related_to
5. Inspector 可切换 EdgeType

如果两个 Node 对应 parent/variant，系统可推荐正确语义，但不自动改变 domain lineage，除非明确 action。

---

# 13. Drag & Drop

支持：

- image file
- 3D file

Drop position：

```text
pointer world coordinate
```

---

# 14. Clipboard Image

从系统 clipboard paste 图片：

- 创建 Asset
- 创建 ImageNode
- 保存 original blob

---

# 15. Fit Content

计算可见 Node bounds。

避免 hidden node 影响。

---

# 16. Zoom to Selection

选中 Node：

- center
- padding

---

# 17. Undo / Redo

进入 history：

- create
- move commit
- resize commit
- delete
- duplicate
- edge create/delete
- property edit
- group/ungroup

不进入：

- hover
- temporary drag state
- viewport（可不进入 v0.1 history）

---

# 18. Snap

v0.1：

可以只做轻量：

- optional grid
- alignment guides

如果做不稳：

优先不做，不能阻塞 release。

---

# 19. Keyboard

Esc：

- exit current tool OR clear selection
- 行为按优先级定义

Space：

- temporary hand
- release 恢复 previous tool

---

# 20. Canvas Context Menu

空白：

- Paste
- Add Image
- Add Concept
- Fit content

Node：

按 PRD。

---

# 21. Acceptance

必须稳定通过：

- 100 nodes pan/zoom
- multi-select move
- copy paste
- undo redo
- delete node without deleting asset
- reopen project with positions intact
