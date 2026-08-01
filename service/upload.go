package service

import (
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var allowedImageExt = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".gif":  true,
	".webp": true,
}

// SaveUploadedImage 保存图片到本地目录，返回公开 URL 路径
func SaveUploadedImage(file *multipart.FileHeader, dir, urlPrefix, namePrefix string) (string, error) {
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if !allowedImageExt[ext] {
		return "", errors.New("仅支持 jpg/png/gif/webp 格式")
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}

	filename := fmt.Sprintf("%s_%d%s", namePrefix, time.Now().UnixNano(), ext)
	destPath := filepath.Join(dir, filename)

	src, err := file.Open()
	if err != nil {
		return "", err
	}
	defer src.Close()

	dst, err := os.Create(destPath)
	if err != nil {
		return "", err
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return "", err
	}

	prefix := strings.TrimSuffix(urlPrefix, "/")
	url := prefix + "/" + filename

	// 帖子正文图：后台预热缩略图，加速首次打开详情
	if strings.Contains(prefix, "/posts") {
		uploadsRoot := filepath.Dir(dir) // .../uploads/posts → .../uploads
		rel := filepath.ToSlash(filepath.Join(filepath.Base(dir), filename))
		go WarmPostImageThumb(uploadsRoot, rel)
	}

	return url, nil
}
