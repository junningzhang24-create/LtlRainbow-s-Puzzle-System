import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Line, Circle, Group, Image, Transformer } from 'react-konva';

const RATIOS = {
  "1:1": 1, "16:9": 16/9, "5:4": 5/4, "7:5": 7/5, "4:3": 4/3, "5:3": 5/3, 
  "3:2": 3/2, "2:3": 2/3, "3:5": 3/5, "3:4": 3/4, "4:5": 4/5, "9:16": 9/16
};

// --- 拼图块组件 ---
const LinkedPiece = ({ id, vertexIds, allVertices, img, isSelected, onSelect, onSplitTriangle, shapeRef }) => {
  const [imageObj, setImageObj] = useState(null);

  useEffect(() => {
    if (!img) { setImageObj(null); return; }
    const i = new window.Image();
    i.src = img;
    i.onload = () => setImageObj(i);
  }, [img]);

  const pieceVertices = vertexIds.map(vid => allVertices.find(v => v.id === vid)).filter(Boolean);
  const currentPoints = pieceVertices.flatMap(v => [v.x, v.y]);
  const xs = pieceVertices.map(v => v.x), ys = pieceVertices.map(v => v.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;

  return (
    <Group onClick={onSelect}>
      <Group clipFunc={(ctx) => {
        ctx.beginPath();
        ctx.moveTo(currentPoints[0], currentPoints[1]);
        for (let i = 2; i < currentPoints.length; i += 2) ctx.lineTo(currentPoints[i], currentPoints[i+1]);
        ctx.closePath();
      }}>
        {/* 背景填充颜色需与无缝描边颜色一致 */}
        <Line points={currentPoints} fill="#f5f5f5" closed />
        {imageObj && (
          <Image
            ref={isSelected ? shapeRef : null}
            image={imageObj}
            x={centerX} y={centerY}
            offsetX={imageObj.width / 2}
            offsetY={imageObj.height / 2}
            scaleX={Math.max((maxX - minX) / imageObj.width, (maxY - minY) / imageObj.height)}
            scaleY={Math.max((maxX - minX) / imageObj.width, (maxY - minY) / imageObj.height)}
            draggable={isSelected}
          />
        )}
      </Group>
      {/* 核心改动：无缝衔接逻辑 */}
      <Line 
        points={currentPoints} 
        // 选中时高亮蓝色，未选中时使用邻接色进行微膨胀填充
        stroke={isSelected ? "#1890ff" : "#f5f5f5"} 
        strokeWidth={isSelected ? 3 : 0.8} 
        closed 
        listening={false} 
      />
      
      {/* 三角形升级点 */}
      {pieceVertices.length === 3 && (
        <Circle 
          x={(pieceVertices[0].x + pieceVertices[1].x)/2} 
          y={(pieceVertices[0].y + pieceVertices[1].y)/2} 
          radius={8} fill="#ff85c0" stroke="white" strokeWidth={1} 
          onClick={() => onSplitTriangle(id, {x: (pieceVertices[0].x + pieceVertices[1].x)/2, y: (pieceVertices[0].y + pieceVertices[1].y)/2, insertAfterIdx: 0})} 
        />
      )}
    </Group>
  );
};

function App() {
  const stageRef = useRef(null);
  const shapeRef = useRef(null);
  const trRef = useRef(null);
  const [photoCount, setPhotoCount] = useState(6);
  const [ratioKey, setRatioKey] = useState("3:2");
  const [vertices, setVertices] = useState([]);
  const [pieces, setPieces] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [rotation, setRotation] = useState(0);

  const generateLayout = useCallback(() => {
    const W = 800, H = 800 / RATIOS[ratioKey];
    const cols = Math.ceil(Math.sqrt(photoCount * RATIOS[ratioKey]));
    const rows = Math.ceil(photoCount / cols);
    let newVs = [];
    let newPs = [];
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        newVs.push({ id: `v-${r}-${c}`, x: (c/cols)*W, y: (r/rows)*H });
      }
    }
    let count = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (count >= photoCount) break;
        newPs.push({ id: `P${++count}`, vertexIds: [`v-${r}-${c}`, `v-${r}-${c+1}`, `v-${r+1}-${c+1}`, `v-${r+1}-${c}`], img: "" });
      }
    }
    setVertices(newVs);
    setPieces(newPs);
    setSelectedId(null);
    setRotation(0);
  }, [photoCount, ratioKey]);

  useEffect(() => { generateLayout(); }, [generateLayout]);

  const handleZoom = (factor) => {
    if (!shapeRef.current) return;
    const node = shapeRef.current;
    node.scale({ x: node.scaleX() * factor, y: node.scaleY() * factor });
    trRef.current.getLayer().batchDraw();
  };

  const handleRotateChange = (val) => {
    const deg = parseInt(val);
    setRotation(deg);
    if (shapeRef.current) {
      shapeRef.current.rotation(deg);
      trRef.current.getLayer().batchDraw();
    }
  };

  const handleWheel = (e) => {
    if (!selectedId || !shapeRef.current) return;
    const oldScale = shapeRef.current.scaleX();
    const newScale = e.evt.deltaY > 0 ? oldScale * 0.98 : oldScale * 1.02;
    shapeRef.current.scale({ x: newScale, y: newScale });
  };

  const handleSplitTriangle = (pieceId, handle) => {
    const newVertexId = `v-split-${Date.now()}`;
    setVertices(prev => [...prev, { id: newVertexId, x: handle.x, y: handle.y }]);
    setPieces(prev => prev.map(p => {
      if (p.id === pieceId) {
        const newVertexIds = [...p.vertexIds];
        newVertexIds.splice(handle.insertAfterIdx + 1, 0, newVertexId);
        return { ...p, vertexIds: newVertexIds };
      }
      return p;
    }));
  };

  useEffect(() => {
    if (selectedId && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      setRotation(Math.round(shapeRef.current.rotation()));
      trRef.current.getLayer().batchDraw();
    }
  }, [selectedId]);

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#1a1a1a', color: 'white', fontFamily: 'system-ui' }}>
      <div style={{ width: '320px', padding: '25px', borderRight: '1px solid #333', display:'flex', flexDirection:'column', gap:'18px', overflowY: 'auto' }}>
        <h2 style={{ color: 'white', margin: 0, fontWeight: 'bold' }}>LtlRainbow的拼图系统 1.0</h2>
        
        {/* 1. 比例设定 */}
        <div>
          <label style={{fontSize:'13px', color:'#aaa'}}>1. 选择画幅比例</label>
          <select value={ratioKey} onChange={(e) => setRatioKey(e.target.value)} style={{ width: '100%', padding: '8px', background:'#222', color:'white', border:'1px solid #444', marginTop:'5px' }}>
            {Object.keys(RATIOS).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>

        {/* 2. 数量设定 */}
        <div>
          <label style={{fontSize:'13px', color:'#aaa'}}>2. 设定照片数量：{photoCount}</label>
          <input type="range" min="2" max="15" value={photoCount} onChange={(e) => setPhotoCount(parseInt(e.target.value))} style={{ width: '100%', marginTop:'5px' }} />
        </div>

        {/* 3. 上传声明 */}
        <div style={{ padding: '15px', background: selectedId ? '#1890ff33' : '#222', borderRadius: '4px' }}>
          <span style={{fontSize:'13px', color:'#aaa'}}>3. 点击方框并上传照片</span>
          <div style={{fontSize:'10px', color:'#666', marginBottom:'5px'}}>支持格式: JPG, PNG, WEBP</div>
          <p style={{margin:'5px 0', fontSize:'14px'}}>{selectedId ? `已选中：${selectedId}` : "请先点击右侧拼图块"}</p>
          <input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(e) => {
            const file = e.target.files[0];
            if (file && selectedId) {
              const url = URL.createObjectURL(file);
              setPieces(pieces.map(p => p.id === selectedId ? { ...p, img: url } : p));
            }
          }} style={{ width: '100%', fontSize:'12px', marginTop:'8px' }} disabled={!selectedId} />
        </div>

        {/* 4 & 5. 精控区 */}
        <div style={{ display: selectedId ? 'flex' : 'none', flexDirection: 'column', gap: '15px' }}>
          <div>
            <label style={{fontSize:'13px', color:'#aaa'}}>4. 高精度缩放 (±2%)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginTop: '5px' }}>
              <button onClick={() => handleZoom(1.02)} style={{padding:'8px', background:'#444', color:'white', border:'none', cursor:'pointer', borderRadius:'4px'}}>放大 (+)</button>
              <button onClick={() => handleZoom(0.98)} style={{padding:'8px', background:'#444', color:'white', border:'none', cursor:'pointer', borderRadius:'4px'}}>缩小 (-)</button>
            </div>
          </div>

          <div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', color:'#aaa' }}>
              <label>5. 自由旋转角度</label>
              <span style={{color: '#1890ff'}}>{rotation}°</span>
            </div>
            <input 
              type="range" min="0" max="360" step="1" 
              value={rotation} 
              onChange={(e) => handleRotateChange(e.target.value)} 
              style={{ width: '100%', marginTop:'8px' }} 
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#666', marginTop: '2px', padding: '0 2px' }}>
              <span>0</span><span>45</span><span>90</span><span>180</span><span>270</span><span>360</span>
            </div>
          </div>
        </div>

        {/* 6. 导出声明 */}
        <button onClick={() => {
          setSelectedId(null);
          setTimeout(() => {
            const uri = stageRef.current.toDataURL({ pixelRatio: 3 });
            const link = document.createElement('a');
            link.download = `LtlRainbow拼图_无缝导出.png`;
            link.href = uri; link.click();
          }, 100);
        }} style={{ padding: '12px', background: '#52c41a', color: 'white', border: 'none', borderRadius: '4px', fontWeight:'bold', cursor:'pointer', marginTop:'auto' }}>
          6. 导出高清 PNG
        </button>

        {/* 指南 */}
        <div style={{ background: '#ffffff05', padding: '15px', borderRadius: '8px', border: '1px solid #ffffff10' }}>
          <strong style={{fontSize:'13px', color:'white'}}>操作手册：</strong>
          <ol style={{ fontSize: '11px', color: '#888', paddingLeft: '18px', marginTop: '10px', lineHeight: '1.8' }}>
            <li><b>设定比例：</b>步骤1选择目标画幅。</li>
            <li><b>调整数量：</b>步骤2改变网格密度。</li>
            <li><b>导入照片：</b>支持 JPG/PNG/WEBP 格式。</li>
            <li><b>几何调整：</b>拖拽红点，实现<b>无缝衔接</b>。</li>
            <li><b>精调对位：</b>步骤4/5或滚轮控制照片。</li>
            <li><b>成品导出：</b>生成 3 倍高清 PNG 格式图片。</li>
          </ol>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background:'#111' }}>
        <Stage ref={stageRef} width={800} height={800 / RATIOS[ratioKey]} style={{ background: '#fff', boxShadow: '0 0 50px rgba(0,0,0,0.5)' }} onWheel={handleWheel}>
          <Layer>
            {pieces.map(p => (
              <LinkedPiece key={p.id} {...p} allVertices={vertices} isSelected={selectedId === p.id} onSelect={() => setSelectedId(p.id)} onSplitTriangle={handleSplitTriangle} shapeRef={shapeRef} />
            ))}
            {selectedId && shapeRef.current && (
              <Transformer 
                ref={trRef} keepRatio={true} 
                anchorFill="white" anchorStroke="black" anchorSize={12} borderStroke="black"
                borderDash={[4, 4]} padding={5}
              />
            )}
            {selectedId && vertices.map(v => (
              <Circle key={v.id} x={v.x} y={v.y} radius={6} fill="#ff4d4f" stroke="white" strokeWidth={1} draggable onDragMove={(e) => setVertices(vertices.map(vert => vert.id === v.id ? { ...vert, x: e.target.x(), y: e.target.y() } : vert))} />
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}

export default App;