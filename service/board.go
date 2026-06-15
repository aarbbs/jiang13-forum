package service

import (
	"errors"

	"github.com/jiang13/forum/model"
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
		model.DB.Model(&model.Post{}).Where("board_id = ?", b.ID).Count(&count)
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

func (s *BoardService) Create(name, desc string, sortOrder int) (*model.Board, error) {
	board := &model.Board{Name: name, Description: desc, SortOrder: sortOrder}
	return board, model.DB.Create(board).Error
}

func (s *BoardService) Update(id uint, name, desc string, sortOrder int) error {
	return model.DB.Model(&model.Board{}).Where("id = ?", id).Updates(map[string]interface{}{
		"name": name, "description": desc, "sort_order": sortOrder,
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
