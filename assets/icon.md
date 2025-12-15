# Application Assets

This directory contains assets for the X-TEC Digital Reporting application.

## Application Icon

To ensure the application has the correct icon for the installer, desktop shortcuts, and window frames, please follow these steps:

1. **File Format**: The application requires an icon in the `.ico` format for Windows builds. This is a specific format that contains multiple image sizes.

2. **File Name**: The icon file **must be named `icon.ico`**.

3. **Location**: Place the `icon.ico` file directly inside this `/assets` directory.

4. **How to Create**: If you only have a PNG or JPG version of your icon, you can easily convert it to the required `.ico` format using a free online converter tool. Search for "PNG to ICO converter". A good `.ico` file should include multiple sizes (like 256x256, 48x48, 32x32, and 16x16) for best results on Windows.

The build process is already configured in `forge.config.js` to automatically find and use `assets/icon.ico`. Once you have placed the correct file here, you are ready to package the application.
