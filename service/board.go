package service

import (
	"errors"

	"git.iioio.com/freefire/jiang13-forum/model"
)

type BoardService struct{}

func NewBoardService() *BoardService {
	return &BoardService{}
}

// BoardWithStats 板块及帖子数量
type BoardWithStats struct {
	model.Board
	PostCount int `json:"post_count"`
}

func (s *BoardService) List() ([]model.Board, error) {
	var boards []model.Board
	err := model.DB.Order("sort_order asc, id asc").Find(&boards).Error
	return boards, err
}

func (s *BoardService) ListWithStats() ([]BoardWithStats, error) {
	boards, err := s.List()
	if err != nil {
		return nil, err
	}
	result := make([]BoardWithStats, len(boards))
	for i, b := range boards {
		var count int64
		model.DB.Model(&model.Post{}).
			Where("board_id = ? AND status = ?", b.ID, model.ContentStatusPublished).
			Count(&count)
		result[i] = BoardWithStats{Board: b, PostCount: int(count)}
	}
	return result, nil
}
func (s *BoardService) GetByID(id uint) (*model.Board, error) {
	var board model.Board
	if err := model.DB.First(&board, id).Error; err != nil {
		return nil, ErrBoardNotFound
	}
	return &board, nil
}

func (s *BoardService) Create(name, desc, icon string, colorIndex, sortOrder int) (*model.Board, error) {
	board := &model.Board{
		Name:        name,
		Description: desc,
		Icon:        NormalizeBoardIcon(icon),
		ColorIndex:  NormalizeBoardColorIndex(colorIndex),
		SortOrder:   sortOrder,
	}
	return board, model.DB.Create(board).Error
}

func (s *BoardService) Update(id uint, name, desc, icon string, colorIndex, sortOrder int) error {
	return model.DB.Model(&model.Board{}).Where("id = ?", id).Updates(map[string]interface{}{
		"name":         name,
		"description":  desc,
		"icon":         NormalizeBoardIcon(icon),
		"color_index":  NormalizeBoardColorIndex(colorIndex),
		"sort_order":   sortOrder,
	}).Error
}

func (s *BoardService) Delete(id uint) error {
	var count int64
	model.DB.Model(&model.Post{}).Where("board_id = ?", id).Count(&count)
	if count > 0 {
		return errors.New("该板块下还有帖子，无法删除")
	}
	return model.DB.Delete(&model.Board{}, id).Error
}

// EnsureDefaultBoard 若尚无板块则创建默认「综合讨论」，便于全新安装后直接发帖
func (s *BoardService) EnsureDefaultBoard() {
	var n int64
	if err := model.DB.Model(&model.Board{}).Count(&n).Error; err != nil || n > 0 {
		return
	}
	_, _ = s.Create("综合讨论", "默认板块，欢迎发帖交流", "message-square", 0, 0)
}
