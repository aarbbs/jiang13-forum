package models

// LevelThresholds 各等级所需最低 Exp（下标 0 对应 Lv1）
var LevelThresholds = []int{0, 20, 50, 100, 200, 400, 800, 1500, 3000, 5000}

// LevelFromExp 由经验推导等级（1–10）
func LevelFromExp(exp int) int {
	if exp < 0 {
		exp = 0
	}
	level := 1
	for i, th := range LevelThresholds {
		if exp >= th {
			level = i + 1
		}
	}
	return level
}

// ExpForLevel 某等级的门槛 Exp（超出范围则钳制）
func ExpForLevel(level int) int {
	if level < 1 {
		level = 1
	}
	if level > len(LevelThresholds) {
		level = len(LevelThresholds)
	}
	return LevelThresholds[level-1]
}

// MaxLevel 最高等级
func MaxLevel() int {
	return len(LevelThresholds)
}
