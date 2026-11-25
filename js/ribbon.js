/* ============================================================
   绸带：播报状态的视觉。停止时冻结在断点，不平滑过渡（真的断了）
   ============================================================ */

export class Ribbon {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = 'idle';
    this.progress = 0;
    this.energy = 0;
    this.phase = 0;
    this.running = false;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._resize = () => this.resize();
    window.addEventListener('resize', this._resize);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(rect.width || this.canvas.clientWidth || 600, 1);
    const h = 86;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.height = h + 'px';
    this.w = w;
    this.h = h;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.draw();
  }

  setState(state) {
    this.state = state;
    if (state === 'idle') { this.progress = 0; this.energy = 0; }
    if (state !== 'speaking') this.draw();
  }

  setProgress(p) { this.progress = Math.min(1, Math.max(0, p)); }

  pulse() {
    this.energy = Math.min(1, this.energy + 0.34);
  }

  start() {
    if (this.running) return;
    this.running = true;
    let last = 0;
    const loop = (t) => {
      if (!this.running) return;
      if (t - last > 32) {
        last = t;
        this.phase += 0.06;
        this.energy *= 0.9;
        this.draw();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    window.removeEventListener('resize', this._resize);
  }

  draw() {
    const { ctx, w, h } = this;
    if (!ctx) return;
    const live = this.state === 'speaking';
    const accent = live ? '#d3472b' : this.state === 'stopped' ? '#d3472b' : '#8b95a1';
    const gold = '#e9b44c';

    ctx.clearRect(0, 0, w, h);

    // 基线
    ctx.strokeStyle = 'rgba(233,236,240,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    const amp = live ? 20 + this.energy * 26 : this.state === 'complete' ? 6 : 3;
    const steps = 160;
    const step = w / (steps - 1);

    // 绸带主体
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(211,71,43,0.06)');
    grad.addColorStop(Math.min(0.98, Math.max(0.02, this.progress)), 'rgba(211,71,43,0.22)');
    grad.addColorStop(1, 'rgba(233,180,76,0.10)');

    ctx.beginPath();
    for (let i = 0; i < steps; i++) {
      const x = i * step;
      const t = i / steps;
      const damp = live ? 1 : 0.26;
      const y = h / 2 + Math.sin(t * 9 + this.phase) * amp * damp * (0.5 + 0.5 * Math.sin(t * 3.1 + this.phase * 0.7));
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    for (let i = steps - 1; i >= 0; i--) {
      const x = i * step;
      const t = i / steps;
      const damp = live ? 1 : 0.26;
      const y = h / 2 - Math.sin(t * 9 + this.phase + 1.1) * amp * damp * (0.45 + 0.55 * Math.sin(t * 2.4 + this.phase * 0.6));
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // 上沿
    ctx.beginPath();
    for (let i = 0; i < steps; i++) {
      const x = i * step;
      const t = i / steps;
      const damp = live ? 1 : 0.26;
      const y = h / 2 + Math.sin(t * 9 + this.phase) * amp * damp * (0.5 + 0.5 * Math.sin(t * 3.1 + this.phase * 0.7));
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = live ? 'rgba(211,71,43,0.85)' : 'rgba(139,149,161,0.5)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // 进度
    const px = this.progress * w;
    if (px > 0) {
      ctx.fillStyle = 'rgba(233,236,240,0.05)';
      ctx.fillRect(0, 0, px, h);
      ctx.strokeStyle = 'rgba(233,180,76,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, 8);
      ctx.lineTo(px, h - 8);
      ctx.stroke();
    }

    // 断点
    if (this.state === 'stopped' && px > 0) {
      ctx.strokeStyle = accent;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(px, h / 2, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.state === 'complete') {
      ctx.strokeStyle = 'rgba(95,211,160,0.55)';
      ctx.beginPath();
      ctx.moveTo(w - 1, 10);
      ctx.lineTo(w - 1, h - 10);
      ctx.stroke();
    }
  }
}
