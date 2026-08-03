package service

import (
	"mime/multipart"
)

var allowedImageExt = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".gif":  true,
	".webp": true,
}

// SaveUploadedImage 保存图片到当前存储后端，返回公开 URL
func SaveUploadedImage(store *UploadStore, file *multipart.FileHeader, category, namePrefix string) (string, error) {
	return store.SaveImage(file, category, namePrefix)
}
