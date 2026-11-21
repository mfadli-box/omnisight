package executor

import (
	"errors"
	"strings"
	"unicode/utf8"

	"gopkg.in/yaml.v3"

	"omnisight/osc_auto/internal/domain"
)

func convert(input domain.OpsInput, emit func(string) error) error {
	if input.Command == nil || input.Compose != nil || input.Env != nil {
		return errors.New("conversion requires a docker run command")
	}
	tokens, err := commandWords(*input.Command)
	if err != nil || len(tokens) < 3 || tokens[0] != "docker" || tokens[1] != "run" {
		return errors.New("enter a single docker run command")
	}
	args := tokens[2:]
	name := "app"
	service := map[string]any{}
	volumes := map[string]any{}
	for len(args) > 0 && strings.HasPrefix(args[0], "-") {
		option, value, inline := strings.Cut(args[0], "=")
		args = args[1:]
		if !inline && (option == "-d" || option == "--detach") {
			continue
		}
		if !inline {
			if len(args) == 0 || strings.HasPrefix(args[0], "-") {
				return errors.New("docker run flag requires a value")
			}
			value, args = args[0], args[1:]
		}
		var field string
		switch option {
		case "--name":
			if !serviceName.MatchString(value) {
				return errors.New("invalid service name")
			}
			name = value
		case "--restart":
			service["restart"] = value
		case "-p", "--publish":
			field = "ports"
		case "-e", "--env":
			if key, _, ok := strings.Cut(value, "="); !ok || !envKey.MatchString(key) {
				return errors.New("environment flags require NAME=value")
			}
			field = "environment"
		case "-v", "--volume":
			match := namedMount.FindStringSubmatch(value)
			if len(match) == 0 {
				return errors.New("volume flags require named volumes")
			}
			volumes[match[1]] = nil
			field = "volumes"
		case "-l", "--label":
			field = "labels"
		default:
			return errors.New("unsupported docker run flag")
		}
		if field != "" {
			list, _ := service[field].([]string)
			service[field] = append(list, literalCompose(value))
		}
	}
	if len(args) == 0 || !imageName.MatchString(args[0]) {
		return errors.New("docker run requires a literal image reference")
	}
	service["image"] = args[0]
	if len(args) > 1 {
		for i, word := range args[1:] {
			args[i+1] = literalCompose(word)
		}
		service["command"] = args[1:]
	}
	manifest := map[string]any{"services": map[string]any{name: service}}
	if len(volumes) > 0 {
		manifest["volumes"] = volumes
	}
	data, err := yaml.Marshal(manifest)
	if err != nil {
		return errors.New("could not generate Compose YAML")
	}
	if err := validateCompose(string(data)); err != nil {
		return err
	}
	return emit(string(data))
}

func literalCompose(value string) string { return strings.ReplaceAll(value, "$", "$$") }

func commandWords(command string) ([]string, error) {
	if len(command) > 4096 || !utf8.ValidString(command) || strings.ContainsAny(command, "\x00\r\n") {
		return nil, errors.New("command is invalid or too large")
	}
	var words []string
	var word strings.Builder
	var quote rune
	var escaped, started bool
	for _, ch := range command {
		switch {
		case escaped:
			word.WriteRune(ch)
			escaped = false
		case ch == '\\' && quote != '\'':
			escaped = true
			started = true
		case quote != 0:
			if ch == quote {
				quote = 0
			} else {
				word.WriteRune(ch)
			}
		case ch == '\'' || ch == '"':
			quote, started = ch, true
		case ch == ' ' || ch == '\t':
			if started {
				words = append(words, word.String())
				word.Reset()
				started = false
			}
		case strings.ContainsRune("|;&<>\x60", ch):
			return nil, errors.New("shell operators are unsupported")
		default:
			word.WriteRune(ch)
			started = true
		}
	}
	if escaped || quote != 0 {
		return nil, errors.New("incomplete quoting")
	}
	if started {
		words = append(words, word.String())
	}
	return words, nil
}
