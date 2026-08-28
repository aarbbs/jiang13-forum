package services

import "os"

func init() {
	readFile = os.ReadFile
}
