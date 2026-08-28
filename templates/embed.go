package templates

import "embed"

//go:embed *.tmpl base/*.tmpl home/*.tmpl post/*.tmpl shared/*.tmpl status/*.tmpl auth/*.tmpl admin/*.tmpl profile/*.tmpl user/*.tmpl favorites/*.tmpl messages/*.tmpl links/*.tmpl
var FS embed.FS
