// public/pictionary/js/drawing-board.js
// The Pictionary drawing canvas. Works with mouse, finger and stylus (Pointer
// Events), draws smooth lines, stays sharp on high-resolution screens and
// keeps every stroke, so undo/redo/clear are exact and the drawing can be
// saved and restored after a reload.
//
// Drawings are always 800x400 "logical" pixels (that's what gets uploaded);
// on screen the canvas is scaled by CSS without changing its shape.

class DrawingBoard {
    constructor(canvas, { width = 800, height = 400, onChange = () => {} } = {}) {
        this.canvas = canvas;
        this.width = width;
        this.height = height;
        this.onChange = onChange;
        this.ctx = canvas.getContext('2d', { willReadFrequently: true });

        this.tool = 'pen';        // 'pen' | 'eraser' | 'fill'
        this.color = '#1f1f1f';
        this.size = 6;
        this.strokes = [];        // the drawing, in order
        this.redoStack = [];
        this.baseImage = null;    // existing drawing when touching up (can't be undone)
        this.enabled = false;
        this.current = null;      // stroke being drawn
        this.pointerId = null;
        this.penSeen = false;     // once a stylus is used, ignore touches (resting palm)

        this.setupResolution();
        this.redraw();

        this.onDown = this.onDown.bind(this);
        this.onMove = this.onMove.bind(this);
        this.onUp = this.onUp.bind(this);
        canvas.addEventListener('pointerdown', this.onDown);
        canvas.addEventListener('pointermove', this.onMove);
        canvas.addEventListener('pointerup', this.onUp);
        canvas.addEventListener('pointercancel', this.onUp);
        canvas.addEventListener('lostpointercapture', this.onUp);
    }

    // Backing store in device pixels, drawing in logical pixels
    setupResolution() {
        this.dpr = Math.min(window.devicePixelRatio || 1, 3);
        this.canvas.width = Math.round(this.width * this.dpr);
        this.canvas.height = Math.round(this.height * this.dpr);
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    enable() {
        this.enabled = true;
        this.canvas.classList.add('drawing-enabled');
    }

    disable() {
        this.enabled = false;
        this.canvas.classList.remove('drawing-enabled');
        if (this.current) this.finishStroke();
    }

    isEmpty() {
        return this.strokes.length === 0 && !this.baseImage;
    }

    hasNewStrokes() {
        return this.strokes.length > 0;
    }

    // ---------- Pointer handling ----------

    toPoint(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * this.width;
        const y = ((event.clientY - rect.top) / rect.height) * this.height;
        // A stylus presses harder for thicker lines; mouse and finger draw evenly
        const pressure = event.pointerType === 'pen' && event.pressure > 0 ? 0.4 + event.pressure * 1.2 : 1;
        return [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(pressure * 100) / 100];
    }

    onDown(event) {
        if (!this.enabled || this.pointerId !== null) return;
        if (event.pointerType === 'pen') this.penSeen = true;
        if (event.pointerType === 'touch' && this.penSeen) return;
        if (event.button !== undefined && event.button > 0) return; // only the main button
        event.preventDefault();

        const point = this.toPoint(event);
        if (this.tool === 'fill') {
            this.addStroke({ tool: 'fill', color: this.color, points: [point] });
            return;
        }
        this.pointerId = event.pointerId;
        this.canvas.setPointerCapture(event.pointerId);
        this.current = {
            tool: this.tool,
            color: this.tool === 'eraser' ? '#ffffff' : this.color,
            size: this.tool === 'eraser' ? this.size * 2.5 : this.size,
            points: [point]
        };
        this.drawDot(this.ctx, this.current, point);
    }

    onMove(event) {
        if (!this.current || event.pointerId !== this.pointerId) return;
        event.preventDefault();
        // Coalesced events give all the points the device saw, for smoother lines
        const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];
        for (const e of (events.length ? events : [event])) {
            const point = this.toPoint(e);
            const last = this.current.points[this.current.points.length - 1];
            if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 0.8) continue;
            this.current.points.push(point);
            this.drawSegment(this.ctx, this.current, this.current.points.length - 1);
        }
    }

    onUp(event) {
        if (!this.current || (event.pointerId !== undefined && event.pointerId !== this.pointerId)) return;
        this.finishStroke();
    }

    finishStroke() {
        const stroke = this.current;
        this.current = null;
        if (this.pointerId !== null) {
            try {
                this.canvas.releasePointerCapture(this.pointerId);
            } catch (e) {
                // already released
            }
        }
        this.pointerId = null;
        this.drawEnd(this.ctx, stroke);
        this.strokes.push(stroke);
        this.redoStack = [];
        this.onChange();
    }

    addStroke(stroke) {
        this.strokes.push(stroke);
        this.redoStack = [];
        this.drawStroke(this.ctx, stroke);
        this.onChange();
    }

    // ---------- Drawing ----------

    lineWidth(stroke, point) {
        return stroke.size * (point[2] || 1);
    }

    drawDot(ctx, stroke, point) {
        ctx.fillStyle = stroke.color;
        ctx.beginPath();
        ctx.arc(point[0], point[1], this.lineWidth(stroke, point) / 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Smooth curve through the midpoints: segment i runs from the midpoint
    // before point i-1 to the midpoint after it, bending towards point i-1.
    drawSegment(ctx, stroke, i) {
        const pts = stroke.points;
        if (i < 1) return;
        const prev = pts[i - 1];
        const cur = pts[i];
        const start = i === 1 ? prev : [(pts[i - 2][0] + prev[0]) / 2, (pts[i - 2][1] + prev[1]) / 2];
        const end = [(prev[0] + cur[0]) / 2, (prev[1] + cur[1]) / 2];
        ctx.strokeStyle = stroke.color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = this.lineWidth(stroke, prev);
        ctx.beginPath();
        ctx.moveTo(start[0], start[1]);
        ctx.quadraticCurveTo(prev[0], prev[1], end[0], end[1]);
        ctx.stroke();
    }

    // The last bit from the final midpoint to the end of the stroke
    drawEnd(ctx, stroke) {
        const pts = stroke.points;
        if (pts.length < 2) return;
        const prev = pts[pts.length - 2];
        const last = pts[pts.length - 1];
        ctx.strokeStyle = stroke.color;
        ctx.lineCap = 'round';
        ctx.lineWidth = this.lineWidth(stroke, last);
        ctx.beginPath();
        ctx.moveTo((prev[0] + last[0]) / 2, (prev[1] + last[1]) / 2);
        ctx.lineTo(last[0], last[1]);
        ctx.stroke();
    }

    drawStroke(ctx, stroke) {
        if (stroke.tool === 'clear') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, this.width, this.height);
        } else if (stroke.tool === 'fill') {
            this.floodFill(stroke.points[0], stroke.color);
        } else {
            this.drawDot(ctx, stroke, stroke.points[0]);
            for (let i = 1; i < stroke.points.length; i++) this.drawSegment(ctx, stroke, i);
            this.drawEnd(ctx, stroke);
        }
    }

    redraw() {
        const ctx = this.ctx;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, this.width, this.height);
        if (this.baseImage) ctx.drawImage(this.baseImage, 0, 0, this.width, this.height);
        this.strokes.forEach(stroke => this.drawStroke(ctx, stroke));
    }

    // Paint bucket: fill the area of similar colour around the point (works
    // on device pixels; a small tolerance swallows anti-aliased edges).
    floodFill(point, color) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const x0 = Math.floor(point[0] * this.dpr);
        const y0 = Math.floor(point[1] * this.dpr);
        if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return;

        const image = this.ctx.getImageData(0, 0, w, h);
        const data = image.data;
        const [r, g, b] = DrawingBoard.parseColor(color);
        const start = (y0 * w + x0) * 4;
        const target = [data[start], data[start + 1], data[start + 2]];
        if (Math.abs(target[0] - r) + Math.abs(target[1] - g) + Math.abs(target[2] - b) < 10) return;

        const tolerance = 120;
        const matches = (i) =>
            Math.abs(data[i] - target[0]) + Math.abs(data[i + 1] - target[1]) + Math.abs(data[i + 2] - target[2]) <= tolerance;
        const filled = new Uint8Array(w * h);
        const stack = [[x0, y0]];
        while (stack.length) {
            const [sx, y] = stack.pop();
            let x = sx;
            while (x > 0 && !filled[y * w + x - 1] && matches((y * w + x - 1) * 4)) x--;
            let spanUp = false;
            let spanDown = false;
            for (; x < w; x++) {
                const p = y * w + x;
                if (filled[p] || !matches(p * 4)) break;
                filled[p] = 1;
                data[p * 4] = r;
                data[p * 4 + 1] = g;
                data[p * 4 + 2] = b;
                data[p * 4 + 3] = 255;
                if (y > 0) {
                    const up = p - w;
                    const ok = !filled[up] && matches(up * 4);
                    if (ok && !spanUp) stack.push([x, y - 1]);
                    spanUp = ok;
                }
                if (y < h - 1) {
                    const down = p + w;
                    const ok = !filled[down] && matches(down * 4);
                    if (ok && !spanDown) stack.push([x, y + 1]);
                    spanDown = ok;
                }
            }
        }
        this.ctx.putImageData(image, 0, 0);
    }

    static parseColor(color) {
        const hex = color.replace('#', '');
        return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
    }

    // ---------- History ----------

    undo() {
        if (!this.strokes.length) return;
        this.redoStack.push(this.strokes.pop());
        this.redraw();
        this.onChange();
    }

    redo() {
        if (!this.redoStack.length) return;
        this.strokes.push(this.redoStack.pop());
        this.redraw();
        this.onChange();
    }

    // "Wis alles" is a step in the history too, so it can be undone
    clear() {
        if (!this.strokes.length && !this.baseImage) return;
        this.addStroke({ tool: 'clear', points: [[0, 0, 1]] });
    }

    // ---------- Base image, saving, restoring ----------

    async setBaseImage(src) {
        const image = new Image();
        image.src = src;
        await image.decode();
        this.baseImage = image;
        this.redraw();
    }

    // The drawing as an 800x400 PNG data URL (white background)
    toDataURL() {
        const out = document.createElement('canvas');
        out.width = this.width;
        out.height = this.height;
        const ctx = out.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.drawImage(this.canvas, 0, 0, this.width, this.height);
        return out.toDataURL('image/png');
    }

    serialize() {
        return JSON.stringify(this.strokes);
    }

    restore(json) {
        try {
            const strokes = JSON.parse(json);
            if (Array.isArray(strokes)) {
                this.strokes = strokes;
                this.redoStack = [];
                this.redraw();
                this.onChange();
            }
        } catch (e) {
            // ignore a broken save
        }
    }

    reset() {
        this.strokes = [];
        this.redoStack = [];
        this.baseImage = null;
        this.current = null;
        this.pointerId = null;
        this.redraw();
        this.onChange();
    }
}
