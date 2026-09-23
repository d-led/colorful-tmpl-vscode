package main

func main() {
	matrix := [][]int{{1, 2}, {3, 4}}

	for _, row := range matrix {
		if len(row) > 0 {
			println(row[0])
		}
	}
}
