const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function generateIcon(size, outputPath) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background gradient (Claude orange/coral)
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#D97706');  // amber-600
  gradient.addColorStop(1, '#EA580C');  // orange-600
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Circle background
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();

  // "C" letter for Claude
  ctx.fillStyle = '#D97706';
  ctx.font = `bold ${size * 0.45}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('C', size / 2, size / 2 + size * 0.02);

  // Premium star indicator
  ctx.fillStyle = '#FCD34D';  // amber-300
  ctx.font = `bold ${size * 0.15}px Arial`;
  ctx.fillText('★', size * 0.78, size * 0.22);

  // Save as PNG
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Created: ${outputPath}`);
}

// Create output directory
const outputDir = path.join(__dirname, '..', 'skill-package', 'assets');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Generate both sizes
generateIcon(108, path.join(outputDir, 'icon_108.png'));
generateIcon(512, path.join(outputDir, 'icon_512.png'));

console.log('Icons generated successfully!');
