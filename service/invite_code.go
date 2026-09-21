package service

import (
	"crypto/rand"
	"errors"
	"math/big"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/model"
	"gorm.io/gorm"
)

var (
	ErrInviteCodeRequired = errors.New("本站需要邀请码才能注册")
	ErrInviteCodeInvalid  = errors.New("邀请码无效")
	ErrInviteCodeExists   = errors.New("邀请码已存在")
	ErrInviteCodeUsedUp   = errors.New("邀请码已用完")
	ErrInviteCodeDisabled = errors.New("邀请码已停用")
)

// 去掉易混淆字符（0/O、1/I/L）的邀请码字符集
const inviteCodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

type InviteCodeService struct{}

func NewInviteCodeService() *InviteCodeService {
	return &InviteCodeService{}
}

func randomInviteCode(length int) string {
	b := make([]byte, length)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(inviteCodeAlphabet))))
		if err != nil {
			n = big.NewInt(0)
		}
		b[i] = inviteCodeAlphabet[n.Int64()]
	}
	return string(b)
}

// Generate 生成一个尚未被占用的随机邀请码
func (s *InviteCodeService) Generate() string {
	for {
		code := randomInviteCode(10)
		var n int64
		model.DB.Model(&model.InviteCode{}).Where("code = ?", code).Count(&n)
		if n == 0 {
			return code
		}
	}
}

// Create 创建邀请码；code 为空时自动生成
func (s *InviteCodeService) Create(code string, maxUses int, note string, createdBy uint) (*model.InviteCode, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if code == "" {
		code = s.Generate()
	}
	if len(code) > 64 {
		return nil, ErrInvalidSetting
	}
	var exist model.InviteCode
	if err := model.DB.Where("code = ?", code).First(&exist).Error; err == nil {
		return nil, ErrInviteCodeExists
	}
	if maxUses < 0 {
		maxUses = 0
	}
	ic := &model.InviteCode{
		Code:      code,
		MaxUses:   maxUses,
		Note:      strings.TrimSpace(note),
		Enabled:   true,
		CreatedBy: createdBy,
	}
	if err := model.DB.Create(ic).Error; err != nil {
		return nil, err
	}
	return ic, nil
}

// List 列出全部邀请码（新的在前）
func (s *InviteCodeService) List() ([]model.InviteCode, error) {
	var list []model.InviteCode
	if err := model.DB.Order("id DESC").Find(&list).Error; err != nil {
		return nil, err
	}
	return list, nil
}

// Delete 删除邀请码
func (s *InviteCodeService) Delete(id uint) error {
	return model.DB.Delete(&model.InviteCode{}, id).Error
}

// Toggle 切换启用/停用状态
func (s *InviteCodeService) Toggle(id uint) (*model.InviteCode, error) {
	var ic model.InviteCode
	if err := model.DB.First(&ic, id).Error; err != nil {
		return nil, ErrInviteCodeInvalid
	}
	ic.Enabled = !ic.Enabled
	if err := model.DB.Save(&ic).Error; err != nil {
		return nil, err
	}
	return &ic, nil
}

// Validate 检查邀请码当前是否可用（不消耗）
func (s *InviteCodeService) Validate(code string) error {
	ic, err := s.find(code)
	if err != nil {
		return err
	}
	if !ic.Enabled {
		return ErrInviteCodeDisabled
	}
	if ic.MaxUses > 0 && ic.UsedCount >= ic.MaxUses {
		return ErrInviteCodeUsedUp
	}
	return nil
}

// Redeem 消耗一次邀请码（事务内校验并递增，避免并发超用）
func (s *InviteCodeService) Redeem(code string) error {
	code = strings.ToUpper(strings.TrimSpace(code))
	if code == "" {
		return ErrInviteCodeInvalid
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		var ic model.InviteCode
		if err := tx.Where("code = ?", code).First(&ic).Error; err != nil {
			return ErrInviteCodeInvalid
		}
		if !ic.Enabled {
			return ErrInviteCodeDisabled
		}
		if ic.MaxUses > 0 && ic.UsedCount >= ic.MaxUses {
			return ErrInviteCodeUsedUp
		}
		ic.UsedCount++
		updates := map[string]interface{}{"used_count": ic.UsedCount}
		if ic.MaxUses > 0 && ic.UsedCount >= ic.MaxUses {
			ic.Enabled = false
			updates["enabled"] = false
		}
		return tx.Model(&ic).Updates(updates).Error
	})
}

func (s *InviteCodeService) find(code string) (*model.InviteCode, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if code == "" {
		return nil, ErrInviteCodeInvalid
	}
	var ic model.InviteCode
	if err := model.DB.Where("code = ?", code).First(&ic).Error; err != nil {
		return nil, ErrInviteCodeInvalid
	}
	return &ic, nil
}
