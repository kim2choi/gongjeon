// Canvas 2D + Pointer Events, checked 2026-11-27 for Safari 26 / Chromium 158.
// https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/ellipse
// https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture
// https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const palettes = [
    {sky:'#101B29', edge:'#101621', haze:'#2A3840', ink:['#F39A76','#E8C78D','#76B8AE','#99BCE1'],
      sun:[[35,29,40],[122,52,55],[221,93,59],[250,153,90],[255,208,140]]},
    {sky:'#0D242A', edge:'#101B26', haze:'#27464B', ink:['#91D9BD','#E4D4A3','#75B7CF','#A6A4D9'],
      sun:[[21,39,53],[35,87,91],[76,153,138],[150,207,163],[227,229,169]]},
    {sky:'#1C1B30', edge:'#171624', haze:'#39354A', ink:['#DDA8E0','#E6B4A2','#90C2CA','#AAA8E6'],
      sun:[[37,32,56],[85,61,106],[150,106,165],[218,158,193],[254,216,196]]}
  ];
  const axes = [0.46, 0.63, 0.81, 1];
  const flattens = [0.47, 0.445, 0.43, 0.42];
  const moonScales = [0.071, 0.11, 0.086, 0.115];

  function randomSequence(seed) {
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function circle(ctx, x, y, radius) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
  }

  function orbitPoint(g, index, phase) {
    const angle = phase * TAU;
    const radial = g.a * axes[index];
    const x = Math.cos(angle) * radial;
    const y = Math.sin(angle) * radial * flattens[index];
    return {x:g.x + g.cos * x - g.sin * y, y:g.y + g.sin * x + g.cos * y};
  }

  function tidalFlow(lon, lat) {
    const x = lon + 0.34, y = lat - 0.12;
    const turn = 4.3*Math.exp(-2.5*(x*x + y*y));
    const u = x*Math.cos(turn) - y*Math.sin(turn);
    const v = x*Math.sin(turn) + y*Math.cos(turn);
    return v*36 + 2.5*Math.sin(u*4.6 + v*2) + 0.72*Math.sin(u*9.3 - v*3);
  }

  // Turning the sphere's normals into latitude/longitude makes even the smallest
  // bands wrap around the limb, as if they were engraved on a physical globe.
  function engraveSun(radius, palette, preset) {
    const canvas = document.createElement('canvas');
    const size = Math.max(4, Math.min(640, Math.ceil(radius * 2)));
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const pixels = ctx.createImageData(size, size);
    const data = pixels.data;
    const random = randomSequence(3829);
    const tilt = [0.16, -0.3, 0.35][preset];
    const cos = Math.cos(tilt), sin = Math.sin(tilt);
    const stops = palette.sun;

    for (let iy = 0; iy < size; iy++) {
      const y = (2 * iy + 1) / size - 1;
      for (let ix = 0; ix < size; ix++) {
        const x = (2 * ix + 1) / size - 1;
        const distance = x*x + y*y;
        if (distance >= 1) continue;
        const z = Math.sqrt(1 - distance);
        const u = x*cos + y*sin;
        const v = y*cos - x*sin;
        const lat = Math.asin(v*0.965 + z*0.261);
        const lon = Math.atan2(u, z*0.965 - v*0.261);
        const eddyX = (lon + 0.48) * 1.55;
        const eddyY = (lat - 0.1) * 5.7;
        const eddy = Math.exp(-(eddyX * eddyX + eddyY * eddyY)) * Math.sin(lon*3.5 - lat*32);
        const flow = preset===1 ? tidalFlow(lon,lat) : lat*43 + 1.4*Math.sin(lon*2.6 + lat*9.0)
          + 0.95*Math.sin(lon*6.1 - lat*4.2) + 0.44*Math.sin(lon*13 + lat*11) + eddy*3.3;
        const groove = Math.pow(Math.max(0, Math.cos(flow*1.8)), 4);
        const band = Math.sin(flow * 0.44) * 0.032 + Math.sin(flow*0.17) * 0.048;
        const light = Math.max(0, -0.55*x - 0.59*y + 0.59*z);
        const grain = (random() - 0.5) * 0.11;
        const value = Math.min(0.999, Math.max(0, 0.17 + light*0.72 + band + grain - groove*0.19
          + Math.pow(1-z, 6)*0.16));
        const stop = Math.floor(value*4);
        const mix = value*4 - stop;
        const offset = (iy*size + ix)*4;
        for (let channel=0; channel<3; channel++) {
          data[offset+channel] = stops[stop][channel]*(1-mix) + stops[stop+1][channel]*mix;
        }
        data[offset+3] = Math.min(255, (1-distance)*size*110);
      }
    }
    ctx.putImageData(pixels, 0, 0);
    return canvas;
  }

  function drawEclipse(ctx, g) {
    const random = randomSequence(7311);
    ctx.save();
    ctx.translate(g.x,g.y);
    ctx.lineWidth = 0.65;
    for (let i=0;i<650;i++) {
      const t=random()*TAU;
      const plume=0.025 + 0.075*Math.pow(0.5+0.5*Math.cos(t*7.4+0.7*Math.sin(t*5)),3);
      const r=g.r*(1+random()*plume);
      ctx.globalAlpha=0.08+random()*0.26;
      ctx.strokeStyle=['#E9C5E9','#A9B7E8','#FECAAA'][i%3];
      ctx.beginPath();
      ctx.moveTo(g.r*0.996*Math.cos(t),g.r*0.996*Math.sin(t));
      ctx.lineTo(r*Math.cos(t+0.003),r*Math.sin(t+0.003));
      ctx.stroke();
    }
    const radius=g.r*0.91;
    ctx.translate(g.r*0.29,-g.r*0.12);
    const shadow=ctx.createRadialGradient(radius*0.30,-radius*0.25,0,0,0,radius);
    shadow.addColorStop(0,'#1D2030');
    shadow.addColorStop(0.83,'#171928');
    shadow.addColorStop(0.98,'#212234');
    shadow.addColorStop(1,'#524356');
    ctx.globalAlpha=1;
    ctx.fillStyle=shadow;
    circle(ctx,0,0,radius);
    ctx.fill();
    ctx.save();
    ctx.clip();
    for (let i=0;i<radius*30;i++) {
      ctx.globalAlpha=random()*0.13;
      ctx.fillStyle=i%2 ? '#D7AACA' : '#707799';
      ctx.fillRect((random()*2-1)*radius,(random()*2-1)*radius,0.64,0.64);
    }
    ctx.restore();
    const rim=ctx.createLinearGradient(-radius,radius,radius,-radius);
    rim.addColorStop(0,'#FFD8C7');
    rim.addColorStop(0.4,'#E3ADCD');
    rim.addColorStop(0.75,'#988FA44A');
    rim.addColorStop(1,'#9391B340');
    ctx.strokeStyle=rim;
    ctx.lineWidth=Math.max(0.75,g.r*0.009);
    circle(ctx,0,0,radius);
    ctx.stroke();
    ctx.restore();
  }

  function drawSky(ctx, g, palette) {
    const random = randomSequence(19273);
    const light = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, Math.max(g.w, g.h)*0.85);
    light.addColorStop(0, palette.haze);
    light.addColorStop(0.55, palette.sky);
    light.addColorStop(1, palette.edge);
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, g.w, g.h);

    const tile = document.createElement('canvas');
    tile.width = tile.height = 144;
    const t = tile.getContext('2d');
    const grain = t.createImageData(144,144);
    for (let i=0; i<grain.data.length; i+=4) {
      const tone = random() > 0.49 ? 232 : 0;
      grain.data[i] = grain.data[i+1] = grain.data[i+2] = tone;
      grain.data[i+3] = random()*13;
    }
    t.putImageData(grain, 0, 0);
    ctx.fillStyle = ctx.createPattern(tile,'repeat');
    ctx.fillRect(0, 0, g.w, g.h);

    const count = Math.round(g.w*g.h / 620);
    for (let i=0; i<count; i++) {
      const x = random()*g.w, y = random()*g.h;
      const brightness = random();
      ctx.fillStyle = i%5 ? '#ECE2D1' : '#ACD1E5';
      ctx.globalAlpha = 0.15 + brightness*0.59;
      const size = brightness>0.977 ? 1.35 : 0.35 + random()*0.64;
      ctx.fillRect(x,y,size,size);
      if (brightness>0.989) {
        ctx.globalAlpha = 0.43;
        ctx.fillRect(x-1.8,y+0.4,4.8,0.48);
        ctx.fillRect(x+0.4,y-1.8,0.48,4.8);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawTracks(ctx, g, palette, front) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.tilt);
    const start = front ? 0 : Math.PI;
    for (let i=0; i<axes.length; i++) {
      const a = g.a*axes[i], b = a*flattens[i];
      ctx.strokeStyle = palette.ink[i];
      ctx.lineWidth = i===0 ? 1.25 : 0.95;
      ctx.globalAlpha = front ? 0.79 : 0.53;
      ctx.beginPath();
      ctx.ellipse(0,0,a,b,0,start,start+Math.PI);
      ctx.stroke();
      ctx.lineWidth = 0.48;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.ellipse(0,0,a+2.6,b+1.4,0,start,start+Math.PI);
      ctx.stroke();
    }
    // A belt of individually printed grains sweeps in front of the sun on
    // the near side and disappears behind the sphere on the far side.
    const random = randomSequence(front ? 6053 : 6490);
    const count = Math.round(g.a * 12);
    for (let i=0; i<count; i++) {
      const t = start + random()*Math.PI;
      const scatter = (random()+random()+random())/3;
      const radius = g.a*(0.495 + scatter*0.102 + Math.sin(t*3)*0.004);
      const x = radius*Math.cos(t);
      const y = radius*0.434*Math.sin(t) + (random()-0.5)*1.25;
      ctx.fillStyle = palette.ink[i%7===0 ? 0 : 1];
      ctx.globalAlpha = (0.08+random()*0.58) * (front ? 1 : 0.72);
      const dot = random() > 0.975 ? 1.12 : 0.32+random()*0.45;
      ctx.fillRect(x, y, dot*1.3, dot);
    }
    // The aligned ticks sit at phase zero for all four musical voices.
    if (front) {
      ctx.strokeStyle = '#EEDEBD';
      ctx.globalAlpha = 0.31;
      ctx.lineWidth = 0.75;
      ctx.setLineDash([1.5,4.4]);
      ctx.beginPath();
      ctx.moveTo(g.a*0.37,0);
      ctx.lineTo(g.a*1.025,0);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i=0; i<axes.length; i++) {
        const x = axes[i]*g.a;
        ctx.globalAlpha=0.86;
        ctx.fillStyle=palette.ink[i];
        ctx.fillRect(x-2.7,-0.8,5.4,1.6);
      }
    }
    ctx.restore();
  }

  function isOccluded(point, g, preset, padding=0) {
    const x=point.x-g.x, y=point.y-g.y;
    return Math.hypot(x,y)<g.r+padding ||
      (preset===2 && Math.hypot(x-g.r*0.29,y+g.r*0.12)<g.r*0.91+padding);
  }

  function clipOutside(ctx,g,x,y,radius) {
    ctx.beginPath();
    ctx.rect(0,0,g.w,g.h);
    ctx.arc(x,y,radius,0,TAU,true);
    ctx.clip('evenodd');
  }

  function drawMoon(ctx, g, state, index, art) {
    const phase = state.phases[index];
    const pos = orbitPoint(g, index, phase);
    const r = Math.max(4.3,g.r*moonScales[index]);
    const color = palettes[state.preset].ink[index];
    const selected = state.selected===index || art.hover===index;
    const pulse = Math.max(0,Math.min(1,state.pulses[index]));
    const visible = state.enabled[index] || pulse>0.03;
    ctx.save();
    if (Math.sin(phase*TAU)<0 && isOccluded(pos,g,state.preset,r+28)) {
      clipOutside(ctx,g,g.x,g.y,g.r);
      if (state.preset===2) clipOutside(ctx,g,g.x+g.r*0.29,g.y-g.r*0.12,g.r*0.91);
    }
    if (state.playing && visible) {
      const a=g.a*axes[index], angle=phase*TAU;
      ctx.strokeStyle=color;
      ctx.lineWidth=1.35;
      for (let i=0;i<4;i++) {
        ctx.globalAlpha=(4-i)*(0.075+pulse*0.08);
        ctx.beginPath();
        ctx.ellipse(g.x,g.y,a,a*flattens[index],g.tilt,angle-(i+1)*0.049,angle-i*0.049);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = visible ? 1 : 0.37;
    ctx.translate(pos.x, pos.y);

    if (selected || pulse>0.02) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = visible ? 0.57 : 0.33;
      circle(ctx,0,0,r+4.4);
      ctx.stroke();
      if (pulse>0.02) {
        ctx.globalAlpha = pulse*0.67;
        circle(ctx,0,0,r+5+(1-pulse)*19);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = visible ? 1 : 0.44;
    const light = ctx.createRadialGradient(-r*0.43,-r*0.51,0,0,0,r*1.1);
    light.addColorStop(0,'#FFF3D9');
    light.addColorStop(0.45,color);
    light.addColorStop(0.94,visible ? color+'72' : '#56626B');
    light.addColorStop(1,'#303944');
    circle(ctx,0,0,r);
    ctx.fillStyle=light;
    ctx.fill();
    ctx.strokeStyle=color;
    ctx.lineWidth=0.58;
    ctx.stroke();
    ctx.save();
    ctx.clip();
    ctx.rotate(-0.35+index*0.23);
    ctx.strokeStyle='#162332';
    ctx.globalAlpha = 0.23;
    ctx.lineWidth=0.65;
    for (let i=-2;i<=2;i++) {
      ctx.beginPath();
      ctx.moveTo(-r,i*r*0.34);
      ctx.quadraticCurveTo(0,i*r*0.34+r*0.48,r,i*r*0.34-r*0.19);
      ctx.stroke();
    }
    ctx.restore();
    if (g.w>390 || selected) {
      ctx.fillStyle = color;
      ctx.globalAlpha = visible ? 0.86 : 0.43;
      ctx.font = '9px ui-monospace, Menlo, monospace';
      const left = pos.x>g.w-38;
      ctx.textAlign = left ? 'right' : 'left';
      ctx.fillText('0'+(index+1),left ? -r-5 : r+5,-r-3);
    }
    ctx.restore();
  }

  window.OrbitArt = class OrbitArt {
    constructor(canvas, callbacks = {}) {
      this.canvas = canvas;
      this.callbacks = callbacks;
      this.ctx = canvas.getContext('2d',{alpha:false});
      this.base = document.createElement('canvas');
      this.hover = -1;
      this.drag = null;
      canvas.style.touchAction = 'none';
      canvas.addEventListener('pointerdown', event => this.down(event));
      canvas.addEventListener('pointermove', event => this.move(event));
      const end = event => {
        if (this.drag && this.drag.id===event.pointerId) {
          this.drag = null;
          this.hover = -1;
          canvas.style.cursor = '';
          if (this.state) this.render(this.state);
        }
      };
      canvas.addEventListener('pointerup',end);
      canvas.addEventListener('pointercancel',end);
      canvas.addEventListener('lostpointercapture',end);
      canvas.addEventListener('pointerleave',() => {
        if (!this.drag && this.hover!==-1) {
          this.hover = -1;
          this.canvas.style.cursor = '';
          if (this.state) this.render(this.state);
        }
      });
      this.observer = new ResizeObserver(() => {
        this.layout();
        if (this.state) this.render(this.state);
      });
      this.observer.observe(canvas);
      this.layout();
    }

    layout() {
      const rect = this.canvas.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      if (w<1 || h<1) return;
      const dpr = Math.min(window.devicePixelRatio || 1,2);
      if (this.g && this.g.w===w && this.g.h===h && this.g.dpr===dpr) return;
      this.canvas.width = this.base.width = Math.round(w*dpr);
      this.canvas.height = this.base.height = Math.round(h*dpr);
      const narrow = w/h<1.13;
      const tilt = narrow ? -0.42 : -0.31;
      const x = w*(narrow ? 0.52 : 0.535), y = h*(narrow ? 0.59 : 0.555);
      const cos = Math.cos(tilt), sin = Math.sin(tilt);
      // A tilted ellipse reaches its lowest point between its major and minor axes.
      const extentX = Math.hypot(cos, flattens[3]*sin) + 0.302*moonScales[3];
      const extentY = Math.hypot(sin, flattens[3]*cos) + 0.302*moonScales[3];
      const a = Math.min((w-x-12)/extentX,(h-y-12)/extentY,(y-23)/extentY,h*(narrow ? 0.92 : 1.06));
      const r = Math.max(6, Math.min(a*0.302,h*0.207));
      this.g = {w,h,dpr,x,y,a:Math.max(2,a),r,tilt,cos:Math.cos(tilt),sin:Math.sin(tilt)};
      this.basePreset = -1;
    }

    paintBase(preset) {
      const g=this.g, palette=palettes[preset];
      const ctx=this.base.getContext('2d',{alpha:false});
      ctx.setTransform(g.dpr,0,0,g.dpr,0,0);
      drawSky(ctx,g,palette);
      drawTracks(ctx,g,palette,false);
      const corona=ctx.createRadialGradient(g.x,g.y,g.r*0.96,g.x,g.y,g.r*1.65);
      corona.addColorStop(0,palette.ink[0]+'1C');
      corona.addColorStop(0.48,palette.ink[0]+'09');
      corona.addColorStop(1,palette.ink[0]+'00');
      ctx.fillStyle=corona;
      ctx.fillRect(g.x-g.r*1.65,g.y-g.r*1.65,g.r*3.3,g.r*3.3);
      const sun=engraveSun(g.r*g.dpr,palette,preset);
      ctx.drawImage(sun,g.x-g.r,g.y-g.r,g.r*2,g.r*2);
      if (preset===2) drawEclipse(ctx,g);
      drawTracks(ctx,g,palette,true);
      this.basePreset=preset;
    }

    render(state) {
      this.state = state;
      if (!this.g) return;
      if (this.g.dpr!==Math.min(window.devicePixelRatio || 1,2)) this.layout();
      if (this.basePreset!==state.preset) this.paintBase(state.preset);
      const ctx=this.ctx, g=this.g;
      ctx.setTransform(1,0,0,1,0,0);
      ctx.drawImage(this.base,0,0);
      ctx.setTransform(g.dpr,0,0,g.dpr,0,0);
      const order = [0,1,2,3].sort((a,b)=>Math.sin(TAU*state.phases[a])-Math.sin(TAU*state.phases[b]));
      for (const i of order) drawMoon(ctx,g,state,i,this);
    }

    local(event) {
      const rect=this.canvas.getBoundingClientRect();
      return {x:event.clientX-rect.left,y:event.clientY-rect.top};
    }

    phaseAt(index,point) {
      const g=this.g, x=point.x-g.x, y=point.y-g.y;
      const u=(x*g.cos+y*g.sin);
      const v=(-x*g.sin+y*g.cos)/flattens[index];
      return (Math.atan2(v,u)/TAU+1)%1;
    }

    hit(point, touch) {
      const g=this.g, state=this.state;
      let nearest=-1, distance=Infinity;
      for (let i=0; i<axes.length; i++) {
        const moon=orbitPoint(g,i,state.phases[i]);
        const d=Math.hypot(point.x-moon.x,point.y-moon.y);
        if (Math.sin(state.phases[i]*TAU)<0 && isOccluded(moon,g,state.preset,-2)) continue;
        if (d < Math.max(touch ? 22 : 15,g.r*moonScales[i]+5) && d<distance) {
          nearest=i; distance=d;
        }
      }
      if (nearest!==-1) return {index:nearest,moon:true};
      for (let i=0; i<axes.length; i++) {
        const phase=this.phaseAt(i,point);
        if (Math.sin(phase*TAU)<0 && isOccluded(point,g,state.preset)) continue;
        const match=orbitPoint(g,i,phase);
        const d=Math.hypot(point.x-match.x,point.y-match.y);
        if (d < (touch ? 16 : 9) && d<distance) {
          nearest=i; distance=d;
        }
      }
      return nearest===-1 ? null : {index:nearest,moon:false};
    }

    down(event) {
      if (event.button!==0 || this.drag || !this.state || !this.g) return;
      const point=this.local(event), hit=this.hit(point,event.pointerType==='touch');
      if (!hit) return;
      event.preventDefault();
      this.canvas.setPointerCapture(event.pointerId);
      this.drag = {id:event.pointerId,index:hit.index};
      this.canvas.style.cursor='grabbing';
      this.callbacks.onSelect?.(hit.index);
      if (!hit.moon) this.callbacks.onPhase?.(hit.index,this.phaseAt(hit.index,point));
      this.callbacks.onPluck?.(hit.index);
    }

    move(event) {
      if (!this.state || !this.g) return;
      const point=this.local(event);
      if (this.drag) {
        if (event.pointerId===this.drag.id) this.callbacks.onPhase?.(this.drag.index,this.phaseAt(this.drag.index,point));
        return;
      }
      if (event.pointerType==='touch') return;
      const hit=this.hit(point,false);
      const next=hit ? hit.index : -1;
      if (next!==this.hover) {
        this.hover=next;
        this.canvas.style.cursor=hit ? 'grab' : '';
        this.render(this.state);
      }
    }
  };
})();
