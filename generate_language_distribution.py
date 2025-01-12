#!/usr/bin/env python3
"""
generate_language_distribution.py

This script generates a programming language distribution image (PNG) showing colored bars and language icons.
"""
import requests
from io import BytesIO
from PIL import Image, ImageDraw

# Define programming languages data: (name, percentage, color, icon_url)
languages = [
    # Use GitHub Linguist language colors
    ('Rust',       50, '#dea584', 'https://raw.githubusercontent.com/github/explore/main/topics/rust/rust.png'),
    ('TypeScript', 23, '#2b7489', 'https://raw.githubusercontent.com/github/explore/main/topics/typescript/typescript.png'),
    ('Python',     12, '#3572A5', 'https://raw.githubusercontent.com/github/explore/main/topics/python/python.png'),
    ('Go',         10, '#00ADD8', 'https://raw.githubusercontent.com/github/explore/main/topics/go/go.png'),
    ('C++',         5, '#f34b7d', 'https://raw.githubusercontent.com/github/explore/main/topics/cpp/cpp.png'),
]

# Scaling factor for higher resolution
SCALE = 2
# Base dimensions and layout parameters
BASE_WIDTH = 600
BASE_BAR_HEIGHT = 25
BASE_ICON_SIZE = 30
BASE_PADDING = 10

# Image dimensions and layout parameters (scaled)
IMG_WIDTH = BASE_WIDTH * SCALE
BAR_HEIGHT = BASE_BAR_HEIGHT * SCALE
ICON_SIZE = BASE_ICON_SIZE * SCALE
PADDING = BASE_PADDING * SCALE
IMG_HEIGHT = BAR_HEIGHT + PADDING + ICON_SIZE + PADDING

# Create base image (white background)
image = Image.new('RGBA', (IMG_WIDTH, IMG_HEIGHT), 'white')
draw = ImageDraw.Draw(image)

# Draw colored bar segments
x_offset = 0
for name, pct, color, icon_url in languages:
    seg_width = int(IMG_WIDTH * pct / 100)
    draw.rectangle([x_offset, 0, x_offset + seg_width, BAR_HEIGHT], fill=color)
    x_offset += seg_width

# Download and paste icons
def fetch_icon(url):
    resp = requests.get(url)
    resp.raise_for_status()
    return Image.open(BytesIO(resp.content)).convert('RGBA')

x_offset = 0
for name, pct, color, icon_url in languages:
    seg_width = int(IMG_WIDTH * pct / 100)
    try:
        icon = fetch_icon(icon_url)
        # Adjust icon size: C++ shrink 40%, TypeScript shrink 10%, Go enlarge 10%, others standard size
        if name == 'C++':
            icon_size = ICON_SIZE * 60 // 100
        elif name == 'TypeScript':
            icon_size = ICON_SIZE * 80 // 100
        elif name == 'Go':
            icon_size = ICON_SIZE * 110 // 100
        else:
            icon_size = ICON_SIZE
        try:
            icon = icon.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
        except AttributeError:
            icon = icon.resize((icon_size, icon_size), Image.LANCZOS)
        # Calculate icon position (centered under its segment and along common midline)
        icon_x = x_offset + (seg_width - icon_size) // 2
        # common baseline: BAR_HEIGHT + PADDING + (ICON_SIZE)//2 places icon midline at same y
        icon_y = BAR_HEIGHT + PADDING + (ICON_SIZE - icon_size) // 2
        image.paste(icon, (icon_x, icon_y), icon)
    except Exception as e:
        print(f"Warning: failed to load {name} icon: {e}")
    x_offset += seg_width

# Save output
output_path = 'language-distribution.png'
image.save(output_path)
print(f"Generated {output_path}") 