(() => {
  "use strict";

  const OUTPUT_WIDTH = 600;
  const OUTPUT_HEIGHT = 900;
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 3.5;

  const fileInput = document.getElementById("portrait-file");
  const sourceName = document.getElementById("source-name");
  const zoomControl = document.getElementById("zoom-control");
  const zoomValue = document.getElementById("zoom-value");
  const rotationControl = document.getElementById("rotation-control");
  const rotationValue = document.getElementById("rotation-value");
  const resetButton = document.getElementById("reset-crop");
  const exportButton = document.getElementById("export-portrait");
  const gridToggle = document.getElementById("grid-toggle");
  const grid = document.getElementById("crop-grid");
  const dropTarget = document.getElementById("drop-target");
  const canvas = document.getElementById("crop-canvas");
  const context = canvas.getContext("2d", { alpha: false });
  const status = document.getElementById("crop-status");
  const previewCanvases = [...document.querySelectorAll("canvas[data-preview]")];

  const state = {
    image: null,
    fileName: "mantis-portrait",
    zoom: 1,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    pointerId: null,
    lastX: 0,
    lastY: 0
  };

  function setStatus(message) {
    status.textContent = message;
  }

  function setControlsEnabled(enabled) {
    zoomControl.disabled = !enabled;
    rotationControl.disabled = !enabled;
    resetButton.disabled = !enabled;
    exportButton.disabled = !enabled;
  }

  function sanitizeFileName(name) {
    const withoutExtension = name.replace(/\.[^.]+$/, "");
    const clean = withoutExtension
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return clean || "mantis-portrait";
  }

  function drawEmptyCanvas(targetContext, width, height) {
    targetContext.fillStyle = "#090e0a";
    targetContext.fillRect(0, 0, width, height);
  }

  function minimumCoverScale(image, angleRadians) {
    const cosine = Math.abs(Math.cos(angleRadians));
    const sine = Math.abs(Math.sin(angleRadians));
    const neededWidth = cosine * OUTPUT_WIDTH + sine * OUTPUT_HEIGHT;
    const neededHeight = sine * OUTPUT_WIDTH + cosine * OUTPUT_HEIGHT;
    return Math.max(neededWidth / image.naturalWidth, neededHeight / image.naturalHeight);
  }

  function renderPreviews() {
    previewCanvases.forEach((preview) => {
      const previewContext = preview.getContext("2d", { alpha: false });
      previewContext.imageSmoothingEnabled = true;
      previewContext.imageSmoothingQuality = "high";
      previewContext.clearRect(0, 0, preview.width, preview.height);
      previewContext.drawImage(canvas, 0, 0, preview.width, preview.height);
    });
  }

  function render() {
    drawEmptyCanvas(context, OUTPUT_WIDTH, OUTPUT_HEIGHT);

    if (state.image) {
      const radians = state.rotation * Math.PI / 180;
      const scale = minimumCoverScale(state.image, radians) * state.zoom;
      const drawWidth = state.image.naturalWidth * scale;
      const drawHeight = state.image.naturalHeight * scale;

      context.save();
      context.translate(OUTPUT_WIDTH / 2 + state.offsetX, OUTPUT_HEIGHT / 2 + state.offsetY);
      context.rotate(radians);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(state.image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      context.restore();
    }

    renderPreviews();
  }

  function syncControls() {
    zoomControl.value = String(state.zoom);
    rotationControl.value = String(state.rotation);
    zoomValue.value = `${Math.round(state.zoom * 100)}%`;
    rotationValue.value = `${state.rotation > 0 ? "+" : ""}${state.rotation}°`;
  }

  function resetCrop(announce = true) {
    state.zoom = 1;
    state.rotation = 0;
    state.offsetX = 0;
    state.offsetY = 0;
    syncControls();
    render();
    if (announce && state.image) {
      setStatus("Crop reset. Drag the picture to reposition it.");
    }
  }

  function loadFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      setStatus("Please choose a PNG, JPG, WebP, or GIF image.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      state.image = image;
      state.fileName = sanitizeFileName(file.name);
      sourceName.textContent = file.name;
      sourceName.title = file.name;
      dropTarget.dataset.empty = "false";
      setControlsEnabled(true);
      resetCrop(false);
      setStatus(`${image.naturalWidth}×${image.naturalHeight} loaded. Drag to position, then export.`);
      canvas.focus({ preventScroll: true });
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setStatus("That image could not be opened. Try a different file.");
    };

    image.src = objectUrl;
  }

  function updateZoom(nextZoom) {
    state.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    syncControls();
    render();
  }

  function beginDrag(event) {
    if (!state.image || event.button !== 0) return;
    state.dragging = true;
    state.pointerId = event.pointerId;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    dropTarget.classList.add("is-dragging");
    canvas.setPointerCapture(event.pointerId);
  }

  function moveDrag(event) {
    if (!state.dragging || event.pointerId !== state.pointerId) return;
    const bounds = canvas.getBoundingClientRect();
    state.offsetX += (event.clientX - state.lastX) * OUTPUT_WIDTH / bounds.width;
    state.offsetY += (event.clientY - state.lastY) * OUTPUT_HEIGHT / bounds.height;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    render();
  }

  function endDrag(event) {
    if (!state.dragging || event.pointerId !== state.pointerId) return;
    state.dragging = false;
    state.pointerId = null;
    dropTarget.classList.remove("is-dragging");
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  function exportPortrait() {
    if (!state.image) return;
    exportButton.disabled = true;
    setStatus("Preparing WebP export…");

    canvas.toBlob((blob) => {
      exportButton.disabled = false;
      if (!blob) {
        setStatus("The browser could not create the WebP. Try Chrome or Edge.");
        return;
      }

      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${state.fileName}-portrait-600x900.webp`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      setStatus(`Saved ${link.download}.`);
    }, "image/webp", .92);
  }

  fileInput.addEventListener("change", () => loadFile(fileInput.files[0]));

  zoomControl.addEventListener("input", () => {
    state.zoom = Number(zoomControl.value);
    syncControls();
    render();
  });

  rotationControl.addEventListener("input", () => {
    state.rotation = Number(rotationControl.value);
    syncControls();
    render();
  });

  resetButton.addEventListener("click", () => resetCrop());
  exportButton.addEventListener("click", exportPortrait);

  gridToggle.addEventListener("change", () => {
    grid.classList.toggle("is-hidden", !gridToggle.checked);
  });

  canvas.addEventListener("pointerdown", beginDrag);
  canvas.addEventListener("pointermove", moveDrag);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  canvas.addEventListener("wheel", (event) => {
    if (!state.image) return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    updateZoom(state.zoom + direction * .08);
  }, { passive: false });

  canvas.addEventListener("keydown", (event) => {
    if (!state.image) return;
    const movement = event.shiftKey ? 20 : 6;
    let handled = true;

    if (event.key === "ArrowLeft") state.offsetX -= movement;
    else if (event.key === "ArrowRight") state.offsetX += movement;
    else if (event.key === "ArrowUp") state.offsetY -= movement;
    else if (event.key === "ArrowDown") state.offsetY += movement;
    else if (event.key === "+" || event.key === "=") updateZoom(state.zoom + .05);
    else if (event.key === "-" || event.key === "_") updateZoom(state.zoom - .05);
    else handled = false;

    if (handled) {
      event.preventDefault();
      render();
    }
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropTarget.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropTarget.classList.add("is-over");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropTarget.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropTarget.classList.remove("is-over");
    });
  });

  dropTarget.addEventListener("drop", (event) => {
    loadFile(event.dataTransfer.files[0]);
  });

  setControlsEnabled(false);
  syncControls();
  render();
})();
