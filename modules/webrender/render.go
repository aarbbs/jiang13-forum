package webrender

import (
	"fmt"
	"html/template"
	"io"
	"net/url"
	"strconv"
	"sync"

	apptemplates "git.iioio.com/freefire/jiang13-forum/templates"
)

var (
	loadOnce sync.Once
	tpl      *template.Template
	loadErr  error
)

func funcMap() template.FuncMap {
	return template.FuncMap{
		"safeHTML": func(s string) template.HTML { return template.HTML(s) },
		"sortURL": func(boardID uint, sort string) string {
			q := url.Values{}
			if sort != "" && sort != "latest" {
				q.Set("sort", sort)
			}
			path := "/"
			if boardID > 0 {
				path = fmt.Sprintf("/board/%d", boardID)
			}
			if enc := q.Encode(); enc != "" {
				return path + "?" + enc
			}
			return path
		},
		"pageURL": func(boardID uint, sort string, page int) string {
			q := url.Values{}
			if sort != "" && sort != "latest" {
				q.Set("sort", sort)
			}
			if page > 1 {
				q.Set("page", strconv.Itoa(page))
			}
			path := "/"
			if boardID > 0 {
				path = fmt.Sprintf("/board/%d", boardID)
			}
			if enc := q.Encode(); enc != "" {
				return path + "?" + enc
			}
			return path
		},
		"postURL": func(id uint) string {
			return fmt.Sprintf("/post/%d", id)
		},
		"queryEscape": url.QueryEscape,
	}
}

var parseGlobs = []string{
	"*.tmpl",
	"base/*.tmpl",
	"home/*.tmpl",
	"post/*.tmpl",
	"shared/*.tmpl",
	"status/*.tmpl",
	"auth/*.tmpl",
	"admin/*.tmpl",
	"profile/*.tmpl",
	"user/*.tmpl",
	"favorites/*.tmpl",
	"messages/*.tmpl",
	"links/*.tmpl",
	"boards/*.tmpl",
}

// Load 解析全部模板（进程内一次）
func Load() (*template.Template, error) {
	loadOnce.Do(func() {
		root := template.New("root").Funcs(funcMap())
		var err error
		for _, g := range parseGlobs {
			root, err = root.ParseFS(apptemplates.FS, g)
			if err != nil {
				loadErr = err
				return
			}
		}
		tpl = root
	})
	return tpl, loadErr
}

// Execute 渲染命名模板到 w
func Execute(w io.Writer, name string, data any) error {
	t, err := Load()
	if err != nil {
		return err
	}
	return t.ExecuteTemplate(w, name, data)
}

// ResetForTest 测试用重置
func ResetForTest() {
	loadOnce = sync.Once{}
	tpl = nil
	loadErr = nil
}
