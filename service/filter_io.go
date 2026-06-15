package service

import "os"

func init() {
	readFile = os.ReadFile
}
