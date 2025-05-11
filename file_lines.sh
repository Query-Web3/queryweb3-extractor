#!/bin/bash
set -e

# 查找src目录下所有.ts文件并统计行数
find src -name "*.ts" -type f | while read file; do
    lines=$(wc -l < "$file")
    echo "$lines $file"
done | sort -nr
