const fs = require('fs');
const { exec } = require('child_process');

// Sizes needed for Chrome extension icons
const sizes = [16, 48, 128];

// Check if ImageMagick is installed
exec('magick --version', (error) => {
    if (error) {
        console.error('Error: ImageMagick is not installed. Please install it first:');
        console.error('Windows: https://imagemagick.org/script/download.php#windows');
        console.error('macOS: brew install imagemagick');
        console.error('Linux: sudo apt-get install imagemagick');
        process.exit(1);
    }

    // Create icons directory if it doesn't exist
    if (!fs.existsSync('icons')) {
        fs.mkdirSync('icons');
    }

    // Convert SVG to PNG for each size
    sizes.forEach(size => {
        const outputFile = `icons/icon${size}.png`;
        const command = `magick convert -background none -size ${size}x${size} icons/icon.svg ${outputFile}`;
        
        exec(command, (error) => {
            if (error) {
                console.error(`Error converting icon to ${size}x${size}:`, error);
            } else {
                console.log(`Created ${outputFile}`);
            }
        });
    });
}); 